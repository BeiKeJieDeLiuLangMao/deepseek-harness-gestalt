#!/usr/bin/env bash
set -euo pipefail

apksigner="${1:?Android SDK apksigner is required}"
apk="${2:?Android APK is required}"

signer_output="$("${apksigner}" verify --print-certs "${apk}")"
signer_digests="$(printf '%s\n' "${signer_output}" | sed -n 's/^.*certificate SHA-256 digest: //p')"
signer_count="$(printf '%s\n' "${signer_digests}" | awk 'length { count += 1 } END { print count + 0 }')"
if [[ "${signer_count}" != 1 || ! "${signer_digests}" =~ ^[0-9a-fA-F]{64}$ ]]; then
  printf 'expected one 64-hex Android signer certificate SHA-256 digest, found %s\n' "${signer_count}" >&2
  exit 1
fi

printf '%s\n' "${signer_digests}" | tr '[:upper:]' '[:lower:]'
