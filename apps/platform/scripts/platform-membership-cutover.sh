#!/usr/bin/env bash

# Sourced by the validated Platform Deploy transaction; never restores file writers.
platform_membership_cutover() {
  local binding transaction phase deadline host_result index response_file remaining_seconds
  binding=$(jq -nc --arg candidate "$PLATFORM_CANDIDATE_SHA" --arg image "$IMAGE" \
    --arg source "$PLATFORM_MEMBERSHIP_SOURCE_SHA256" --arg predecessor "$PLATFORM_MEMBERSHIP_PREDECESSOR_IMAGE" \
    --arg predecessorRevision "$PLATFORM_MEMBERSHIP_PREDECESSOR_SHA" \
    --argjson budget "$PLATFORM_MEMBERSHIP_DEADLINE_SECONDS" --args \
    '{candidateCommit:$candidate,imageIdentity:$image,sourceDigest:$source,predecessorImage:$predecessor,predecessorRevision:$predecessorRevision,deadlineSeconds:$budget,instanceIds:$ARGS.positional}' "${instance_ids[@]}")
  transaction=$(printf '%s' "$binding" | sha256sum | cut -d ' ' -f 1)
  if [ "$state_probe_status" = 0 ]; then
    jq -e --arg transaction "$transaction" --argjson binding "$binding" \
      '.kind == "membership-cutover-v1" and .transaction == $transaction and .binding == $binding' <<< "$state_probe" >/dev/null \
      || { echo 'platform: membership cutover identity differs from the unresolved transaction' >&2; return 1; }
    printf '%s\n' "$state_probe" > "$state_file"
  else
    deadline=$(($(date +%s) + PLATFORM_MEMBERSHIP_DEADLINE_SECONDS))
    jq -nc --arg transaction "$transaction" --argjson binding "$binding" --argjson deadline "$deadline" \
      '{version:3,kind:"membership-cutover-v1",transaction:$transaction,binding:$binding,deadline:$deadline,phase:"staging",hosts:{}}' > "$state_file"
  fi
  deadline=$(jq -er '.deadline | numbers' "$state_file")
  if [ "$deadline" -ge "$PLATFORM_CREDENTIALS_EXPIRE_AT" ] || [ "$deadline" -ge "$PLATFORM_SIGNED_URLS_EXPIRE_AT" ]; then
    echo 'platform: maintenance deadline exceeds the remaining credential or signed-URL lifetime' >&2
    return 1
  fi
  phase=$(jq -er '.phase | select(. == "staging" or . == "fencing" or . == "fenced" or . == "captured" or . == "importing" or . == "imported" or . == "activating" or . == "committed")' "$state_file")
  export DSH_MEMBERSHIP_TRANSACTION="$transaction" DSH_MEMBERSHIP_DEADLINE="$deadline"

  membership_checkpoint() {
    phase="$1"
    jq --arg phase "$phase" '.phase = $phase' "$state_file" > "${state_file}.next"
    mv "${state_file}.next" "$state_file"
    aliyun oss cp "$state_file" "$state_object" \
      --region "$PLATFORM_ALIYUN_REGION" --endpoint "$PLATFORM_DEPLOY_OSS_UPLOAD_ENDPOINT" --force >/dev/null
  }
  membership_host() {
    local host_index="$1" action="$2"
    remaining_seconds=$((deadline - $(date +%s)))
    if [ "$remaining_seconds" -le 0 ]; then
      echo 'platform: membership maintenance deadline expired; state and stopped predecessors are retained' >&2
      return 1
    fi
    response_file=$(mktemp "$DEPLOY_DIR/membership-result.XXXXXX")
    export DSH_MEMBERSHIP_COORDINATOR_PHASE="$phase"
    remote_action "${instance_ids[$host_index]}" "relay-$((host_index + 1))" "$action" "$response_file"
    jq -e --arg transaction "$transaction" --arg instance "${instance_ids[$host_index]}" \
      --slurpfile durable "$state_file" \
      '.transaction == $transaction and .instanceId == $instance and (.predecessorId | test("^[0-9a-f]{64}$")) and (.runtimeEnvDigest | test("^[0-9a-f]{64}$")) and ($durable[0].hosts[$instance] == null or (.predecessorId == $durable[0].hosts[$instance].predecessorId and .runtimeEnvDigest == $durable[0].hosts[$instance].runtimeEnvDigest))' "$response_file" >/dev/null
    jq --arg instance "${instance_ids[$host_index]}" --slurpfile result "$response_file" \
      '.hosts[$instance] = $result[0]' "$state_file" > "${state_file}.next"
    mv "${state_file}.next" "$state_file"
    membership_checkpoint "$phase"
  }

  membership_checkpoint "$phase"
  # Re-entry refreshes only matching encrypted configuration and immutable image bytes.
  for index in 0 1; do membership_host "$index" membership-stage; done
  if [ "$phase" = staging ]; then membership_checkpoint fencing; fi
  if [ "$phase" = fencing ]; then
    for index in 0 1; do membership_host "$index" membership-fence; done
    membership_checkpoint fenced
  fi
  if [ "$phase" = fenced ]; then
    for index in 0 1; do membership_host "$index" membership-capture; done
    membership_checkpoint captured
  fi
  if [ "$phase" = captured ]; then membership_checkpoint importing; fi
  if [ "$phase" = importing ]; then
    for index in 0 1; do membership_host "$index" membership-revalidate-source; done
    membership_host 0 membership-import
    membership_host 1 membership-verify-import
    membership_checkpoint imported
  fi
  if [ "$phase" = imported ]; then
    for index in 0 1; do membership_host "$index" membership-start-candidate; done
    membership_checkpoint activating
  fi
  if [ "$phase" = activating ]; then
    for index in 0 1; do membership_host "$index" membership-activate; done
    platform_public_readiness 30
    membership_checkpoint committed
  fi
  for index in 0 1; do membership_host "$index" membership-commit; done
  platform_public_readiness 30
  aliyun oss cp "$state_file" "oss://${PLATFORM_OSS_BUCKET}/${PLATFORM_DEPLOY_OSS_OBJECT_PREFIX}/membership-cutovers/${transaction}.json" \
    --region "$PLATFORM_ALIYUN_REGION" --endpoint "$PLATFORM_DEPLOY_OSS_UPLOAD_ENDPOINT" --force >/dev/null
  state_resolved=1
}
