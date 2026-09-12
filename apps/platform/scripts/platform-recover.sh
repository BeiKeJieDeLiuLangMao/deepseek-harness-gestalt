#!/usr/bin/env bash

set -eEuo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# Recover always sources the extract helper; tests stub platform_cloud_run first, so recover
# skips platform-cloud-assistant.sh and cannot inherit the helper from the assistant.
if ! declare -F platform_extract_json_object >/dev/null; then
  source "$script_dir/platform-oss-json.sh"
fi
if ! declare -F platform_cloud_run >/dev/null; then
  source "$script_dir/platform-cloud-assistant.sh"
fi

: "${PLATFORM_ALIYUN_REGION:?}" "${PLATFORM_ECS_INSTANCE_IDS:?}" "${PLATFORM_OSS_BUCKET:?}"
: "${PLATFORM_DEPLOY_OSS_UPLOAD_ENDPOINT:?}" "${PLATFORM_DEPLOY_OSS_OBJECT_PREFIX:?}"
: "${RECOVERY_COMMAND:?}"

state_object="oss://${PLATFORM_OSS_BUCKET}/${PLATFORM_DEPLOY_OSS_OBJECT_PREFIX}/active-state.json"
state=$(aliyun oss cat "$state_object" --region "$PLATFORM_ALIYUN_REGION" --endpoint "$PLATFORM_DEPLOY_OSS_UPLOAD_ENDPOINT" | platform_extract_json_object)
jq_state() {
  jq -er "$1" <<< "$state" | tr -d '\r'
}

if [ "$(jq -r '.kind // empty' <<< "$state" | tr -d '\r')" = membership-cutover-v1 ]; then
  echo 'platform: resume the bound membership_cutover transaction; ordinary recovery cannot restore file writers' >&2
  exit 1
fi
version=$(jq_state '.version | select(. == 1 or . == 2)')
mode=rolling
if [ "$version" = 2 ]; then
  mode=$(jq_state '.mode | select(. == "rolling" or . == "bootstrap")')
fi
phase=$(jq_state '.phase | select(. == "rollbackable" or . == "commit-pending" or . == "committed")')
object_root=$(jq_state '.objectRoot')
candidate_commit=
if [ "$mode" = bootstrap ]; then
  candidate_commit=$(jq_state '.candidateCommit | select(test("^[0-9a-f]{40}$"))')
fi
state_instance_ids=()
while IFS= read -r instance_id; do
  [ -n "$instance_id" ] || continue
  state_instance_ids+=("$instance_id")
done < <(jq_state '.instanceIds | select(length == 2) | .[]')
object_suffix="${object_root#"${PLATFORM_DEPLOY_OSS_OBJECT_PREFIX}/"}"
if [ "$object_suffix" = "$object_root" ] || [[ ! "$object_suffix" =~ ^[0-9]+-[0-9]+$ ]]; then
  echo 'platform: invalid deployment recovery object root' >&2
  exit 1
fi

IFS=',' read -r -a instance_ids <<< "$PLATFORM_ECS_INSTANCE_IDS"
for index in "${!instance_ids[@]}"; do
  instance_ids[$index]="${instance_ids[$index]// /}"
done
if [ "${#state_instance_ids[@]}" != 2 ] \
  || [ "${state_instance_ids[0]}" != "${instance_ids[0]:-}" ] \
  || [ "${state_instance_ids[1]}" != "${instance_ids[1]:-}" ]; then
  echo 'platform: deployment recovery targets differ from the durable state' >&2
  exit 1
fi
stop_recovery() {
  trap - INT TERM
  exit "$1"
}
trap 'stop_recovery 130' INT
trap 'stop_recovery 143' TERM

write_recovery_command() {
  {
    printf 'set -- %s\n' "$1"
    if [ "$mode" = bootstrap ]; then
      printf 'export DSH_DEPLOY_CANDIDATE=%q\n' "$candidate_commit"
    fi
    tail -n +2 "$script_dir/platform-host-deploy.sh"
  } > "$RECOVERY_COMMAND"
}

run_recovery_on_all() {
  local action="$1" timeout="$2" instance_id recovery_failed=0
  write_recovery_command "$action"
  for instance_id in "${instance_ids[@]}"; do
    platform_cloud_run "${instance_id// /}" "$RECOVERY_COMMAND" "$timeout" || recovery_failed=1
  done
  test "$recovery_failed" = 0
}

if [ "$mode" = bootstrap ]; then
  if [ "$phase" = committed ]; then
    run_recovery_on_all complete-bootstrap 2100
  elif [ "$phase" = rollbackable ]; then
    run_recovery_on_all bootstrap-rollback 2100
  else
    echo 'platform: bootstrap recovery state is ambiguous' >&2
    exit 1
  fi
elif [ "$phase" = rollbackable ]; then
  run_recovery_on_all rollback 2100
else
  if [ "$phase" = commit-pending ]; then
    run_recovery_on_all complete-rollback-cleanup 2100
    write_recovery_command cutover
    platform_cloud_run "${instance_ids[0]// /}" "$RECOVERY_COMMAND" 300
    instance_ids_json=$(jq -nc --args '$ARGS.positional' -- "${state_instance_ids[@]}")
    jq -nc --arg objectRoot "$object_root" --argjson instanceIds "$instance_ids_json" \
      '{version:1, phase:"committed", objectRoot:$objectRoot, instanceIds:$instanceIds}' > "${RECOVERY_COMMAND}.state"
    aliyun oss cp "${RECOVERY_COMMAND}.state" "$state_object" \
      --region "$PLATFORM_ALIYUN_REGION" --endpoint "$PLATFORM_DEPLOY_OSS_UPLOAD_ENDPOINT" --force >/dev/null
  fi
  run_recovery_on_all complete-commit 2100
fi

aliyun oss rm "oss://${PLATFORM_OSS_BUCKET}/${object_root}/platform.tar.gz" \
  --region "$PLATFORM_ALIYUN_REGION" --endpoint "$PLATFORM_DEPLOY_OSS_UPLOAD_ENDPOINT" --force >/dev/null 2>&1 || true
aliyun oss rm "oss://${PLATFORM_OSS_BUCKET}/${object_root}/platform.env.enc" \
  --region "$PLATFORM_ALIYUN_REGION" --endpoint "$PLATFORM_DEPLOY_OSS_UPLOAD_ENDPOINT" --force >/dev/null 2>&1 || true
aliyun oss rm "oss://${PLATFORM_OSS_BUCKET}/${object_root}/platform-host-deploy.sh" \
  --region "$PLATFORM_ALIYUN_REGION" --endpoint "$PLATFORM_DEPLOY_OSS_UPLOAD_ENDPOINT" --force >/dev/null 2>&1 || true
aliyun oss rm "$state_object" --region "$PLATFORM_ALIYUN_REGION" --endpoint "$PLATFORM_DEPLOY_OSS_UPLOAD_ENDPOINT" --force >/dev/null
