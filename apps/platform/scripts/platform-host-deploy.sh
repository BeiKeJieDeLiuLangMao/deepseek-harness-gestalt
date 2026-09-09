#!/usr/bin/env bash

set -eEuo pipefail

action="${1:?platform host action is required}"
candidate_env=/run/dsh-platform-candidate.env
exec 9>/run/dsh-platform-deploy.lock
flock -x 9

stage_image() {
    : "${DSH_DEPLOY_IMAGE_URL:?}" "${DSH_DEPLOY_IMAGE_SHA256:?}" "${DSH_DEPLOY_ENV_URL:?}"
    : "${DSH_DEPLOY_ENV_SHA256:?}" "${DSH_DEPLOY_ENV_KEY:?}" "${DSH_DEPLOY_IMAGE:?}"
    : "${DSH_DEPLOY_STORAGE:?}" "${DSH_RELAY_INSTANCE_ID:?}"
    dnf -y install docker openssl >/dev/null 2>&1 || yum -y install docker openssl >/dev/null 2>&1
    systemctl enable --now docker
    workdir=$(mktemp -d /run/dsh-platform-prepare.XXXXXX)
    cleanup_prepare() {
      find "$workdir" -type f -delete
      rmdir "$workdir"
    }
    trap cleanup_prepare EXIT
    curl --proto '=https' --tlsv1.2 -fsS "$DSH_DEPLOY_IMAGE_URL" -o "$workdir/platform.tar.gz"
    curl --proto '=https' --tlsv1.2 -fsS "$DSH_DEPLOY_ENV_URL" -o "$workdir/platform.env.enc"
    printf '%s  %s\n' "$DSH_DEPLOY_IMAGE_SHA256" "$workdir/platform.tar.gz" | sha256sum -c -
    printf '%s  %s\n' "$DSH_DEPLOY_ENV_SHA256" "$workdir/platform.env.enc" | sha256sum -c -
    gzip -dc "$workdir/platform.tar.gz" | docker load
    install -m 600 /dev/null "$candidate_env"
    DSH_DEPLOY_ENV_KEY="$DSH_DEPLOY_ENV_KEY" openssl enc -d -aes-256-cbc -pbkdf2 \
      -in "$workdir/platform.env.enc" -out "$candidate_env" -pass env:DSH_DEPLOY_ENV_KEY
    printf 'PLATFORM_RELAY_INSTANCE_ID=%s\n' "$DSH_RELAY_INSTANCE_ID" >> "$candidate_env"
}

membership_action() {
  python3 - "$action" <<'MEMBERSHIP_PY'
import hashlib
import json
import os
import pathlib
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

root = pathlib.Path('/var/lib/dsh-platform-membership-cutover')
record = root / 'state.json'
candidate_env = pathlib.Path('/run/dsh-platform-candidate.env')
volume = pathlib.Path('/var/lib/docker/volumes/dsh-platform-membership/_data')
source = volume / 'production/project-membership.json'
evidence = root / 'evidence'
snapshot = evidence / 'source.json'
action = sys.argv[1]
e = os.environ
deadline = int(e['DSH_MEMBERSHIP_DEADLINE'])
action_deadline = min(deadline, int(e['DSH_MEMBERSHIP_ACTION_DEADLINE']))
identity = {
    'transaction': e['DSH_MEMBERSHIP_TRANSACTION'],
    'candidateCommit': e['DSH_DEPLOY_CANDIDATE'],
    'imageIdentity': e['DSH_DEPLOY_IMAGE'],
    'sourceDigest': e['DSH_MEMBERSHIP_SOURCE_SHA256'],
    'predecessorImage': e['DSH_MEMBERSHIP_PREDECESSOR_IMAGE'],
    'predecessorRevision': e['DSH_MEMBERSHIP_PREDECESSOR_SHA'],
    'instanceId': e['DSH_MEMBERSHIP_INSTANCE_ID'],
    'relayInstanceId': e['DSH_RELAY_INSTANCE_ID'],
}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def remaining():
    value = action_deadline - int(time.time()) - 60
    require(value > 0, 'membership maintenance deadline expired')
    return value


def run(*args):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=remaining())
    require(result.returncode == 0, 'membership host operation failed: ' + args[0])
    return result.stdout.strip()


def containers():
    ids = run('docker', 'ps', '-aq').split()
    return json.loads(run('docker', 'inspect', *ids)) if ids else []


def named(name):
    matches = [c for c in containers() if c['Name'] == '/' + name]
    require(len(matches) <= 1, 'duplicate Platform container name')
    return matches[0] if matches else None


def image_revision(image):
    value = json.loads(run('docker', 'image', 'inspect', image))[0]
    return (value['Config'].get('Labels') or {}).get('org.opencontainers.image.revision')


def write_state():
    fd, temporary = tempfile.mkstemp(prefix='.state-', dir=root)
    try:
        with os.fdopen(fd, 'w') as out:
            json.dump(state, out, sort_keys=True)
            out.write('\n')
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, record)
        directory = os.open(root, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def phase(value):
    state['phase'] = value
    write_state()


def predecessor():
    matches = [c for c in containers() if c['Id'] == state['predecessorId']]
    require(len(matches) == 1, 'bound predecessor container is missing')
    old = matches[0]
    require(old['Config']['Image'] == identity['predecessorImage'], 'predecessor image changed')
    require(any(m.get('Name') == 'dsh-platform-membership' and m['Destination'] == '/var/lib/dsh/projects'
                and m['Source'] == str(volume) and m['RW'] for m in old['Mounts']), 'predecessor membership volume changed')
    return old


def owned(container):
    labels = container['Config'].get('Labels') or {}
    return (container['Config']['Image'] == identity['imageIdentity']
            and labels.get('dsh.platform.membership-transaction') == identity['transaction']
            and labels.get('dsh.platform.runtime-env-sha256') == state['runtimeEnvDigest'])


def inventory(allow_candidates=False):
    all_containers = containers()
    allowed_ids = []
    for container in all_containers:
        if container['Id'] == state['predecessorId']:
            allowed_ids.append(container['Id'])
            continue
        relevant = (container['Name'].startswith('/dsh-platform')
                    or any(m['Source'] == str(volume) for m in container['Mounts'])
                    or container['Config']['Image'].split('@')[0] == identity['imageIdentity'].split('@')[0])
        if relevant:
            require(allow_candidates and owned(container), 'unexpected Platform writer or membership volume consumer')
            allowed_ids.append(container['Id'])
    for process in pathlib.Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        try:
            executable = (process / 'exe').resolve().name
            if executable in ('node', 'bun', 'deno'):
                group = (process / 'cgroup').read_text()
                require(any(container_id in group for container_id in allowed_ids), 'unexpected host runtime process during membership maintenance')
            for descriptor in (process / 'fd').iterdir():
                target = str(descriptor.resolve())
                if target == str(volume) or target.startswith(str(volume) + '/'):
                    group = (process / 'cgroup').read_text()
                    require(any(container_id in group for container_id in allowed_ids), 'unexpected open membership volume descriptor')
        except (FileNotFoundError, ProcessLookupError):
            continue


def fenced(allow_candidates=False):
    old = predecessor()
    require(not old['State']['Running'] and old['State']['Pid'] == 0
            and old['HostConfig']['RestartPolicy']['Name'] == 'no', 'predecessor writer is not fenced')
    require(old['State']['ExitCode'] == 0 and not old['State'].get('OOMKilled'), 'predecessor did not stop cleanly')
    inventory(allow_candidates)


def private_env():
    require(candidate_env.is_file() and not candidate_env.is_symlink(), 'private candidate environment is missing')
    require(hashlib.sha256(candidate_env.read_bytes()).hexdigest() == state['runtimeEnvDigest'], 'runtime environment changed during membership maintenance')


def cleanup_cli():
    pending = state.get('cli')
    if pending is None:
        return
    cleanup_deadline = time.monotonic() + 55

    def command(*args):
        timeout = cleanup_deadline - time.monotonic()
        require(timeout > 0, 'maintenance CLI cleanup deadline expired; quiescence is unverified')
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
        require(result.returncode == 0, 'maintenance CLI cleanup failed; quiescence is unverified')
        return result.stdout.strip()

    names = command('docker', 'ps', '-aq', '--filter', 'name=^/' + pending['name'] + '$').split()
    require(len(names) <= 1, 'maintenance CLI container name is ambiguous')
    if names:
        container = json.loads(command('docker', 'inspect', names[0]))[0]
        labels = container['Config'].get('Labels') or {}
        require(owned(container) and labels.get('dsh.platform.membership-command') == pending['commandDigest'],
                'maintenance CLI container belongs to another command')
        require(pending.get('id', container['Id']) == container['Id'], 'maintenance CLI container generation changed')
        if container['State']['Running']:
            command('docker', 'kill', container['Id'])
        if container['State'].get('Status') != 'created':
            command('docker', 'wait', container['Id'])
        stopped = json.loads(command('docker', 'inspect', container['Id']))[0]
        pending['exitCode'] = stopped['State']['ExitCode']
        require(not stopped['State']['Running'] and stopped['State']['Pid'] == 0, 'maintenance CLI did not exit')
        command('docker', 'rm', '-f', container['Id'])
        require(not command('docker', 'ps', '-aq', '--filter', 'id=' + container['Id']), 'maintenance CLI container still exists')
    pending['status'] = 'quiescent'
    write_state()


def cli(entry, *args, network='host', mounts=()):
    private_env()
    cleanup_cli()
    name = 'dsh-membership-cli-' + identity['transaction'][:16] + '-' + identity['relayInstanceId']
    digest = hashlib.sha256(json.dumps([entry, args, network, mounts]).encode()).hexdigest()
    state['cli'] = {'name': name, 'entry': entry, 'operation': args[0], 'commandDigest': digest, 'status': 'creating'}
    write_state()
    try:
        container_id = run('docker', 'create', '--name', name, '--restart', 'no', '--network', network,
            '--label', 'dsh.platform.membership-transaction=' + identity['transaction'],
            '--label', 'dsh.platform.runtime-env-sha256=' + state['runtimeEnvDigest'],
            '--label', 'dsh.platform.membership-command=' + digest,
            '--env-file', str(candidate_env), '-e', 'DSH_MEMBERSHIP_DEADLINE=' + str(action_deadline - 60), *mounts,
            identity['imageIdentity'], 'node', 'dist/' + entry + '.mjs', *args)
        require(len(container_id) == 64 and all(c in '0123456789abcdef' for c in container_id), 'maintenance CLI returned an invalid container identity')
        state['cli'].update({'id': container_id, 'status': 'starting'})
        write_state()
        run('docker', 'start', container_id)
        state['cli']['status'] = 'running'
        write_state()
        exit_code = run('docker', 'wait', container_id)
        require(exit_code == '0', 'maintenance CLI exited unsuccessfully')
    finally:
        previous = signal.signal(signal.SIGTERM, signal.SIG_IGN)
        try:
            cleanup_cli()
        finally:
            signal.signal(signal.SIGTERM, previous)


def validate_live_source():
    paths = list(volume.rglob('*'))
    require(not any(p.is_symlink() for p in paths), 'membership source contains a symlink')
    first = identity['relayInstanceId'] == 'relay-1'
    if first:
        require(source.is_file() and all(not p.is_file() or p == source for p in paths), 'approved membership source layout changed')
        require(hashlib.sha256(source.read_bytes()).hexdigest() == identity['sourceDigest'], 'approved membership source digest changed')
    else:
        require(not any(p.is_file() for p in paths), 'second membership source is not empty')

def snapshot_digest():
    require(snapshot.is_file() and not snapshot.is_symlink(), 'membership snapshot is missing')
    return hashlib.sha256(snapshot.read_bytes()).hexdigest()


def ready(port):
    for _ in range(30):
        remaining()
        try:
            with urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/readyz', timeout=min(5, remaining())) as response:
                body = json.load(response)
            if (body.get('ok') is True and body.get('membershipStorage') == 'postgres'
                    and body.get('accountDeletion') is True and body.get('attachmentStorage') == 'oss'
                    and body.get('instanceId') == identity['relayInstanceId']):
                return
        except (OSError, ValueError):
            pass
        time.sleep(min(1, remaining()))
    raise RuntimeError('membership candidate readiness failed')


def start(name, port):
    private_env()
    existing = named(name)
    if existing is None:
        run('docker', 'run', '-d', '--name', name, '--restart', 'no',
            '--label', 'dsh.platform.membership-transaction=' + identity['transaction'],
            '--label', 'dsh.platform.runtime-env-sha256=' + state['runtimeEnvDigest'],
            '--log-driver', 'json-file', '--log-opt', 'max-size=20m', '--log-opt', 'max-file=3',
            '-p', ('127.0.0.1:18080' if port == 18080 else '80') + ':8080',
            '--env-file', str(candidate_env), identity['imageIdentity'])
    else:
        require(owned(existing), 'candidate container belongs to another transaction')
        if not existing['State']['Running']:
            run('docker', 'start', existing['Id'])
    ready(port)


def interrupted(_number, _frame):
    raise RuntimeError('membership maintenance interrupted')


signal.signal(signal.SIGTERM, interrupted)
signal.signal(signal.SIGINT, interrupted)

try:
    require(not root.is_symlink(), 'membership state directory cannot be a symlink')
    root.mkdir(mode=0o700, exist_ok=True)
    require(root.stat().st_uid == 0 and root.stat().st_mode & 0o077 == 0, 'membership state directory is not private')
    require(not record.is_symlink(), 'membership state file cannot be a symlink')
    state = json.loads(record.read_text()) if record.exists() else None
    if state is not None:
        require(all(state.get(k) == v for k, v in identity.items()), 'membership transaction identity changed')
        require(state['deadline'] == deadline, 'membership transaction deadline changed')
        cleanup_cli()
        remaining()
    else:
        require(action == 'membership-stage', 'membership transaction has not been staged')
        old = named('dsh-platform')
        require(old is not None and old['State']['Running'], 'running predecessor is missing before maintenance')
        require(old['Config']['Image'] == identity['predecessorImage']
                and image_revision(identity['predecessorImage']) == identity['predecessorRevision'], 'predecessor image or revision differs from approval')
        state = {**identity, 'deadline': deadline, 'phase': 'staged', 'predecessorId': old['Id'],
                 'predecessorRestartPolicy': old['HostConfig']['RestartPolicy']}
        predecessor()
        inventory()
    if action == 'membership-stage':
        require(image_revision(identity['imageIdentity']) == identity['candidateCommit'], 'staged image revision differs from candidate')
        staged = pathlib.Path(e['DSH_MEMBERSHIP_STAGED_ENV'])
        raw = staged.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        values = dict(line.split('=', 1) for line in raw.decode().splitlines() if '=' in line)
        old_values = dict(line.split('=', 1) for line in predecessor()['Config']['Env'] if '=' in line)
        require(values.get('PLATFORM_MEMBERSHIP_BACKEND') == 'postgres'
                and values.get('PLATFORM_REMOTE_ATTACHMENT_STORAGE') == 'oss', 'staged runtime is not PostgreSQL membership with OSS')
        for key in ('PLATFORM_ORIGIN', 'PLATFORM_POSTGRES_DATABASE', 'PLATFORM_IDENTITY_NAMESPACE', 'PLATFORM_GITHUB_CREDENTIAL_REFERENCE'):
            require(values.get(key) == old_values.get(key), 'staged production identity changed')
        require(state.get('runtimeEnvDigest', digest) == digest, 'staged runtime environment differs from transaction')
        state['runtimeEnvDigest'] = digest
        fd = os.open(candidate_env, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as out:
            out.write(raw)
        write_state()
    elif action == 'membership-fence':
        require(state['phase'] in ('staged', 'fencing', 'fenced'), 'membership fence cannot run after import or activation')
        inventory()
        old = predecessor()
        phase('fencing')
        run('docker', 'update', '--restart=no', old['Id'])
        if old['State']['Running']:
            run('docker', 'stop', '--time', '60', old['Id'])
        fenced()
        phase('fenced')
    elif action == 'membership-capture':
        require(state['phase'] in ('fenced', 'captured'), 'membership capture requires both writers fenced')
        fenced()
        validate_live_source()
        first = identity['relayInstanceId'] == 'relay-1'
        evidence.mkdir(mode=0o700, exist_ok=True)
        os.chown(evidence, 10001, 10001)
        if not snapshot.exists():
            cli('membership-cutover-cli', 'capture', *(['--source', '/source/production/project-membership.json'] if first else ['--empty']),
                '--output', '/evidence/source.json', network='none', mounts=(
                    '--mount', 'type=volume,source=dsh-platform-membership,target=/source,readonly',
                    '--mount', 'type=bind,source=' + str(evidence) + ',target=/evidence'))
        document = json.loads(snapshot.read_text())
        expected = identity['sourceDigest'] if first else hashlib.sha256(b'{"formatVersion":1,"projects":[],"memberships":[],"invitations":[]}').hexdigest()
        require(snapshot_digest() == expected, 'retained membership snapshot differs from approved source')
        state['snapshotDigest'] = expected
        state['sourceCounts'] = {key: len(document[key]) for key in ('projects', 'memberships', 'invitations')}
        cli('membership-maintenance-cli', 'empty')
        phase('captured')
    elif action == 'membership-revalidate-source':
        require(state['phase'] in ('captured', 'importing', 'imported'), 'membership source revalidation requires captured evidence')
        fenced()
        validate_live_source()
    elif action == 'membership-import':
        require(identity['relayInstanceId'] == 'relay-1' and state['phase'] in ('captured', 'importing', 'imported'), 'membership import has no captured source')
        require(e['DSH_MEMBERSHIP_COORDINATOR_PHASE'] == 'importing', 'coordinator has not fenced and captured both sources')
        fenced()
        validate_live_source()
        require(snapshot_digest() == identity['sourceDigest'], 'approved snapshot changed before import')
        if state['phase'] == 'captured':
            cli('membership-maintenance-cli', 'empty')
            phase('importing')
        cli('membership-cutover-cli', 'import', '--source', '/evidence/source.json', '--sha256', identity['sourceDigest'], '--writers-fenced',
            mounts=('--mount', 'type=bind,source=' + str(evidence) + ',target=/evidence,readonly'))
        cli('membership-maintenance-cli', 'imported', identity['sourceDigest'])
        phase('imported')
    elif action == 'membership-verify-import':
        require(state['phase'] in ('captured', 'imported'), 'membership shared read requires captured source evidence')
        fenced()
        validate_live_source()
        cli('membership-maintenance-cli', 'imported', identity['sourceDigest'])
        phase('imported')
    elif action == 'membership-start-candidate':
        require(state['phase'] in ('imported', 'candidate-starting', 'candidate-ready'), 'membership candidate requires verified shared import')
        require(e['DSH_MEMBERSHIP_COORDINATOR_PHASE'] == 'imported', 'both hosts have not verified shared import')
        fenced(True)
        phase('candidate-starting')
        start('dsh-platform-candidate', 18080)
        phase('candidate-ready')
    elif action == 'membership-activate':
        require(state['phase'] in ('candidate-ready', 'activating', 'serving'), 'membership activation requires ready candidates')
        require(e['DSH_MEMBERSHIP_COORDINATOR_PHASE'] == 'activating', 'both candidates are not ready')
        fenced(True)
        phase('activating')
        old = predecessor()
        if old['Name'] == '/dsh-platform':
            run('docker', 'rename', old['Id'], 'dsh-platform-membership-source')
        candidate = named('dsh-platform-candidate')
        if candidate is not None:
            require(owned(candidate), 'loopback candidate belongs to another transaction')
            if candidate['State']['Running']:
                run('docker', 'stop', '--time', '60', candidate['Id'])
            stopped = named('dsh-platform-candidate')
            require(stopped is not None and not stopped['State']['Running'] and stopped['State']['ExitCode'] == 0,
                    'loopback candidate did not stop cleanly')
        start('dsh-platform', 80)
        phase('serving')
    elif action == 'membership-commit':
        require(state['phase'] in ('serving', 'committed'), 'membership commit requires the serving candidate')
        require(e['DSH_MEMBERSHIP_COORDINATOR_PHASE'] == 'committed', 'public readiness has not committed the transaction')
        require(owned(named('dsh-platform')), 'serving candidate belongs to another transaction')
        ready(80)
        run('docker', 'update', '--restart=unless-stopped', 'dsh-platform')
        phase('committed')
    else:
        raise RuntimeError('unknown membership maintenance host action')
    print(json.dumps({key: state[key] for key in ('transaction', 'instanceId', 'relayInstanceId', 'predecessorId',
        'predecessorRestartPolicy', 'runtimeEnvDigest', 'phase')} | {key: state[key] for key in ('snapshotDigest', 'sourceCounts', 'cli') if key in state}))
except Exception as error:
    message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
    print('platform: membership maintenance stopped: ' + message, file=sys.stderr)
    sys.exit(1)
MEMBERSHIP_PY
}

membership_ready() {
  local body="$1" expected="${DSH_DEPLOY_MEMBERSHIP:-file}" deletion=false
  if [ "$expected" = postgres ]; then deletion=true; fi
  printf '%s' "$body" | grep -Fq '"membershipStorage":"'"$expected"'"' \
    && printf '%s' "$body" | grep -Fq '"accountDeletion":'"$deletion"
}

require_membership_authority() {
  local body
  body=$(curl -fsS --max-time 5 http://127.0.0.1:80/readyz) || return 1
  printf '%s' "$body" | grep -Fq '"ok":true' || return 1
  if [ "${DSH_DEPLOY_MEMBERSHIP:-file}" = postgres ]; then
    if ! membership_ready "$body"; then
      echo 'platform: PostgreSQL membership requires completed all-writer cutover before rolling deployment' >&2
      return 1
    fi
  elif printf '%s' "$body" | grep -Fq '"membershipStorage":"postgres"'; then
    echo 'platform: file membership requires writer-fenced current export before activation' >&2
    return 1
  fi
}

wait_for_storage() {
  local port="$1" expected_storage="$2" body attempt
  for attempt in $(seq 1 30); do
    if body=$(curl -fsS --max-time 2 "http://127.0.0.1:${port}/readyz") \
      && printf '%s' "$body" | grep -Fq '"attachmentStorage":"'"$expected_storage"'"' \
      && printf '%s' "$body" | grep -Fq '"ok":true' \
      && membership_ready "$body" \
      && printf '%s' "$body" | grep -Fq '"instanceId":"'"$DSH_RELAY_INSTANCE_ID"'"'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_for_ready() {
  local port="$1" body attempt
  for attempt in $(seq 1 30); do
    if body=$(curl -fsS --max-time 2 "http://127.0.0.1:${port}/readyz") \
      && printf '%s' "$body" | grep -Fq '"ok":true'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

ensure_container_absent() {
  local container_name="$1" container_names
  docker info >/dev/null || return 1
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  container_names=$(docker ps -a --format '{{.Names}}') || return 1
  if grep -Fxq "$container_name" <<< "$container_names"; then
    return 1
  fi
}

require_bootstrap_owner() {
  : "${DSH_DEPLOY_CANDIDATE:?}"
  local bootstrap_owned
  if ! bootstrap_owned=$(docker inspect dsh-platform --format '{{index .Config.Labels "dsh.platform.bootstrap-candidate"}}'); then
    echo 'platform: bootstrap candidate ownership does not match durable recovery state' >&2
    return 1
  fi
  if [ "$bootstrap_owned" != "$DSH_DEPLOY_CANDIDATE" ]; then
    echo 'platform: bootstrap candidate ownership does not match durable recovery state' >&2
    return 1
  fi
}

if [[ "$action" != membership-* ]] && [ -f /var/lib/dsh-platform-membership-cutover/state.json ]; then
  python3 -c 'import json; assert json.load(open("/var/lib/dsh-platform-membership-cutover/state.json"))["phase"] == "committed", "unfinished membership cutover requires its dedicated mode"'
fi

case "$action" in
  membership-stage)
    test "$(date +%s)" -lt "$DSH_MEMBERSHIP_DEADLINE"
    dnf -y install python3 >/dev/null 2>&1 || yum -y install python3 >/dev/null 2>&1
    staged_env=$(mktemp /run/dsh-membership-env.XXXXXX)
    candidate_env="$staged_env"
    stage_image >/dev/null
    trap 'cleanup_prepare; unlink "$staged_env"' EXIT
    export DSH_MEMBERSHIP_STAGED_ENV="$staged_env"
    membership_action
    ;;
  membership-fence|membership-capture|membership-revalidate-source|membership-import|membership-verify-import|membership-start-candidate|membership-activate|membership-commit)
    membership_action
    ;;
  verify-bootstrap-bare)
    container_names=
    if command -v docker >/dev/null 2>&1; then
      docker info >/dev/null
      container_names=$(docker ps -a --format '{{.Names}}')
    fi
    for container_name in dsh-platform dsh-platform-candidate dsh-platform-rollback; do
      if grep -Fxq "$container_name" <<< "$container_names"; then
        echo "platform: bootstrap target is not bare: $container_name exists" >&2
        exit 1
      fi
    done
    if [ -e "$candidate_env" ]; then
      echo 'platform: bootstrap target is not bare: candidate environment exists' >&2
      exit 1
    fi
    ;;
  verify-membership-authority)
    require_membership_authority
    ;;
  prepare)
    stage_image
    if [ "$DSH_DEPLOY_STORAGE" = oss ]; then
      docker run --rm --network host --env-file "$candidate_env" "$DSH_DEPLOY_IMAGE" \
        node dist/oss-lifecycle-cli.mjs
    fi
    docker rm -f dsh-platform-candidate >/dev/null 2>&1 || true
    docker run -d --name dsh-platform-candidate --restart no \
      --log-driver json-file --log-opt max-size=20m --log-opt max-file=3 \
      -p 127.0.0.1:18080:8080 --env-file "$candidate_env" "$DSH_DEPLOY_IMAGE"
    wait_for_storage 18080 "$DSH_DEPLOY_STORAGE"

    token=$(curl -fsS --max-time 5 -X PUT http://100.100.100.200/latest/api/token \
      -H 'X-aliyun-ecs-metadata-token-ttl-seconds:60' || true)
    account=
    if [ -n "$token" ]; then
      account=$(curl -fsS --max-time 5 -H "X-aliyun-ecs-metadata-token: $token" \
        http://100.100.100.200/latest/meta-data/owner-account-id || true)
    fi
    account="${account:-${PLATFORM_SLS_ACCOUNT_ID:-}}"
    test -n "$account"
    collector_image=aliyun-observability-release-registry.cn-hangzhou.cr.aliyuncs.com/loongcollector/loongcollector:v3.0.12.0-25723a1-aliyun
    if ! docker pull "$collector_image"; then
      docker image inspect "$collector_image" >/dev/null
    fi
    docker rm -f dsh-loongcollector >/dev/null 2>&1 || true
    docker run -d --name dsh-loongcollector --restart unless-stopped \
      -v /:/logtail_host:ro \
      -v /var/run/docker.sock:/var/run/docker.sock \
      --env ALIYUN_LOGTAIL_CONFIG=/etc/ilogtail/conf/cn-hangzhou/ilogtail_config.json \
      --env ALIYUN_LOGTAIL_USER_ID="$account" \
      --env ALIYUN_LOGTAIL_USER_DEFINED_ID=gestalt-platform \
      "$collector_image"
    ;;
  verify-predecessor)
    : "${DSH_DEPLOY_STORAGE:?}"
    docker inspect dsh-platform >/dev/null
    ! docker inspect dsh-platform-rollback >/dev/null 2>&1
    body=$(curl -fsS --max-time 5 http://127.0.0.1:80/readyz)
    if [ "$DSH_DEPLOY_STORAGE" = oss ]; then
      printf '%s' "$body" | grep -Eq '"attachmentStorage":"(postgres|oss)"'
    fi
    ;;
  replace)
    : "${DSH_DEPLOY_IMAGE:?}" "${DSH_DEPLOY_STORAGE:?}"
    docker rename dsh-platform dsh-platform-rollback
    docker stop --time 60 dsh-platform-rollback
    docker rm -f dsh-platform-candidate >/dev/null
    docker run -d --name dsh-platform --restart unless-stopped \
      --log-driver json-file --log-opt max-size=20m --log-opt max-file=3 \
      -v dsh-platform-membership:/var/lib/dsh/projects \
      -p 80:8080 --env-file "$candidate_env" "$DSH_DEPLOY_IMAGE"
    wait_for_storage 80 "$DSH_DEPLOY_STORAGE"
    ;;
  bootstrap-replace)
    : "${DSH_DEPLOY_IMAGE:?}" "${DSH_DEPLOY_CANDIDATE:?}" "${DSH_DEPLOY_STORAGE:?}"
    ! docker inspect dsh-platform >/dev/null 2>&1
    ! docker inspect dsh-platform-rollback >/dev/null 2>&1
    docker rm -f dsh-platform-candidate >/dev/null
    docker run -d --name dsh-platform --restart unless-stopped \
      --label dsh.platform.bootstrap-candidate="$DSH_DEPLOY_CANDIDATE" \
      --log-driver json-file --log-opt max-size=20m --log-opt max-file=3 \
      -v dsh-platform-membership:/var/lib/dsh/projects \
      -p 80:8080 --env-file "$candidate_env" "$DSH_DEPLOY_IMAGE"
    wait_for_storage 80 "$DSH_DEPLOY_STORAGE"
    ;;
  bootstrap-rollback)
    set +e
    rollback_failed=0
    : "${DSH_DEPLOY_CANDIDATE:?}"
    if ! command -v docker >/dev/null 2>&1; then
      unlink "$candidate_env" 2>/dev/null || true
      test ! -e "$candidate_env"
      exit $?
    fi
    docker info >/dev/null || exit 1
    if docker inspect dsh-platform >/dev/null 2>&1; then
      if ! require_bootstrap_owner; then
        exit 1
      fi
      docker stop --time 60 dsh-platform >/dev/null 2>&1 || true
      ensure_container_absent dsh-platform || rollback_failed=1
    fi
    ensure_container_absent dsh-platform-candidate || rollback_failed=1
    unlink "$candidate_env" 2>/dev/null || true
    test ! -e "$candidate_env" || rollback_failed=1
    exit "$rollback_failed"
    ;;
  rollback)
    set +e
    rollback_failed=0
    docker info >/dev/null || exit 1
    rollback_containers=$(docker ps -a --format '{{.Names}}') || exit 1
    if grep -Fxq dsh-platform-rollback <<< "$rollback_containers"; then
      docker stop --time 60 dsh-platform >/dev/null 2>&1 || true
      docker rm -f dsh-platform >/dev/null 2>&1 || true
      docker rename dsh-platform-rollback dsh-platform && docker start dsh-platform \
        || rollback_failed=1
    fi
    ensure_container_absent dsh-platform-candidate || rollback_failed=1
    unlink "$candidate_env" 2>/dev/null || true
    test ! -e "$candidate_env" || rollback_failed=1
    wait_for_ready 80 || rollback_failed=1
    exit "$rollback_failed"
    ;;
  cleanup-rollback)
    docker rm dsh-platform-rollback >/dev/null
    ;;
  complete-rollback-cleanup)
    ensure_container_absent dsh-platform-rollback
    ;;
  cutover)
    deploy_image="${DSH_DEPLOY_IMAGE:-$(docker inspect dsh-platform --format '{{.Config.Image}}')}"
    docker run --rm --network host --env-file "$candidate_env" "$deploy_image" \
      node dist/attachment-storage-cutover-cli.mjs
    ;;
  finalize)
    unlink "$candidate_env"
    ;;
  complete-commit)
    ensure_container_absent dsh-platform-rollback
    ensure_container_absent dsh-platform-candidate
    unlink "$candidate_env" 2>/dev/null || true
    test ! -e "$candidate_env"
    ;;
  complete-bootstrap)
    if ! require_bootstrap_owner; then
      exit 1
    fi
    ensure_container_absent dsh-platform-candidate
    ! docker inspect dsh-platform-rollback >/dev/null 2>&1
    wait_for_ready 80
    unlink "$candidate_env" 2>/dev/null || true
    test ! -e "$candidate_env"
    ;;
  *)
    printf 'platform: unsupported host action: %s\n' "$action" >&2
    exit 2
    ;;
esac
