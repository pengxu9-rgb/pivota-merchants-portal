#!/usr/bin/env bash
# Resolve an Artifact Registry tag to the linux/amd64 image Cloud Run records.
set -euo pipefail

repo=${1:?usage: resolve-cloud-run-image.sh <repository> <tag>}
tag=${2:?usage: resolve-cloud-run-image.sh <repository> <tag>}
token=$(gcloud auth print-access-token)
echo "::add-mask::${token}" >&2
manifest=$(curl -sSf --retry 3 --connect-timeout 10 --max-time 60 \
  -H "Authorization: Bearer ${token}" \
  -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' \
  "https://${repo%%/*}/v2/${repo#*/}/manifests/${tag}")

if jq -e 'type == "object" and has("manifests")' <<<"$manifest" >/dev/null; then
  digest=$(jq -er '[.manifests[] | select(.platform.os == "linux" and .platform.architecture == "amd64") | .digest]
    | if length == 1 then .[0] else empty end' <<<"$manifest") \
    || { echo "::error::${repo}:${tag} has no unique linux/amd64 image" >&2; exit 1; }
else
  digest=$(gcloud artifacts docker images describe "${repo}:${tag}" --format='value(image_summary.digest)')
fi

[[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || { echo "::error::could not resolve the digest for ${repo}:${tag}" >&2; exit 1; }
printf '%s@%s\n' "$repo" "$digest"
