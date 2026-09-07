#!/usr/bin/env bash
set -euo pipefail

stage=initialize
trap 'status=$?; trap - ERR; printf "android acceptance candidate verification failed at %s (exit %d)\n" "$stage" "$status" >&2; exit "$status"' ERR

manifest="${1:?acceptance candidate manifest is required}"
apk="${2:?acceptance candidate APK is required}"
: "${CANDIDATE_SHA:?}" "${PLAN_PATH:?}" "${MOBILE_VERSION:?}" "${MOBILE_BUILD_NUMBER:?}"
: "${OPERATED_ORIGIN:?}" "${EXPECTED_REPOSITORY:?}" "${EXPECTED_WORKFLOW_RUN:?}"

stage=locate-apksigner
apksigner="${APKSIGNER_PATH:-}"
if [ -z "$apksigner" ]; then
  apksigner=$(find "${ANDROID_SDK_ROOT:?}/build-tools" -mindepth 2 -maxdepth 2 -type f -name apksigner -print | sort -V | tail -1)
fi
stage=verify-apksigner-executable
test -x "$apksigner"

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  else
    shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}

runtime_entry=assets/public/dsh-mobile-runtime-identity.json
stage=count-runtime-identity
entry_count=$(unzip -Z1 "$apk" | grep -Fxc "$runtime_entry" || true)
stage="verify-runtime-identity-count:${entry_count}"
test "$entry_count" = 1
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
runtime_identity="$workdir/dsh-mobile-runtime-identity.json"
stage=extract-runtime-identity
unzip -p "$apk" "$runtime_entry" > "$runtime_identity"
stage=verify-runtime-identity-content
test -s "$runtime_identity"

apk_name=$(basename "$apk")
stage="digest-apk:${apk_name}"
apk_digest=$(sha256_file "$apk")
stage=read-signer-certificate
signer=$($apksigner verify --print-certs "$apk" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p')
stage=verify-signer-digest
[[ "$signer" =~ ^[0-9a-fA-F]{64}$ ]]
signer=$(printf '%s' "$signer" | tr '[:upper:]' '[:lower:]')
stage=read-baked-origin
baked_origin=$(jq -er 'select(.version == 1) | .origin | strings' "$runtime_identity")
stage=verify-baked-origin
test "$baked_origin" = "$OPERATED_ORIGIN"
runtime_identity_digest=$(sha256_file "$runtime_identity")
packaging_digest=$(sha256_file apps/mobile/scripts/build-android-release.sh)

stage=verify-manifest
jq -e --arg candidate "$CANDIDATE_SHA" --arg plan "$PLAN_PATH" \
  --arg version "$MOBILE_VERSION" --argjson build "$MOBILE_BUILD_NUMBER" \
  --arg repository "$EXPECTED_REPOSITORY" --arg workflowRun "$EXPECTED_WORKFLOW_RUN" \
  --arg apk "$apk_name" --arg artifact "sha256:$apk_digest" \
  --arg signer "sha256:$signer" --arg runtimeIdentity "sha256:$runtime_identity_digest" \
  --arg packaging "sha256:$packaging_digest" \
  '.version == 1 and .mode == "acceptance-candidate" and .surface == "mobile"
    and .candidateCommit == $candidate and .planPath == $plan
    and .productVersion == $version and .buildNumber == $build
    and .repository == $repository and .workflowRun == $workflowRun
    and .artifactDigests == {($apk):$artifact}
    and .signerCertificateSha256 == $signer
    and .runtimeIdentitySha256 == $runtimeIdentity
    and .packagingScriptSha256 == $packaging
    and (keys | sort == ["artifactDigests","buildNumber","candidateCommit","mode","packagingScriptSha256","planPath","productVersion","repository","runtimeIdentitySha256","signerCertificateSha256","surface","version","workflowRun"])' \
  "$manifest" >/dev/null
