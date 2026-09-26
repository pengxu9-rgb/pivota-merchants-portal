#!/usr/bin/env bash
# Print, one per line, the `docker` arguments infra/gcp/cloudbuild.yaml builds with, with
# its substitutions resolved — so GitHub Actions builds EXACTLY the release recipe, and
# cloudbuild.yaml stays the one place build args and the _CONSUMER_CAPTURE opt-in live.
#
#   usage: infra/gcp/docker-build-args.sh <image-tag>
#   docker $(...) is unsafe with spaces; read into an array:
#     mapfile -t args < <(infra/gcp/docker-build-args.sh "$SHA"); docker "${args[@]}"
#
# Refuses (exit 1) on any substitution it does not know, rather than passing a literal
# "${_SOMETHING}" into the bundle. Requires mikefarah yq v4 (preinstalled on GitHub runners).
set -euo pipefail
tag=${1:?usage: docker-build-args.sh <image-tag>}
cfg="$(dirname "$0")/cloudbuild.yaml"

[ "$(yq -r '.steps | length' "$cfg")" = 1 ] || { echo "cloudbuild.yaml: expected exactly one step" >&2; exit 1; }
[ "$(yq -r '.steps[0].name' "$cfg")" = gcr.io/cloud-builders/docker ] || { echo "cloudbuild.yaml: step is not docker" >&2; exit 1; }

consumer=$(yq -r '.substitutions._CONSUMER_CAPTURE' "$cfg")
[ "$consumer" != null ] || { echo "cloudbuild.yaml: no _CONSUMER_CAPTURE default" >&2; exit 1; }

yq -r '.steps[0].args[]' "$cfg" | while IFS= read -r arg; do
  arg=${arg//'${_CONSUMER_CAPTURE}'/$consumer}
  arg=${arg//'$COMMIT_SHA'/$tag}
  case "$arg" in *'$'*) echo "cloudbuild.yaml: unresolved substitution in: $arg" >&2; exit 1 ;; esac
  printf '%s\n' "$arg"
done
