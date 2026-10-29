#!/usr/bin/env bash
set -euo pipefail

overlay="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$overlay/.." && pwd)"
dockerfile="$repo_root/Dockerfile"
work="$overlay/.work"

patch_targets=(
  "0001-add-standard-api-routes.patch:apis/routes/_rest_routes_standard.inc.php"
  "0002-register-api-scopes.patch:src/Common/Auth/OpenIDConnect/Entities/ServerScopeListEntity.php"
)

regen_only="false"
[ "${1:-}" = "--regen-only" ] && regen_only="true"
base_image="${2:-}"

if [ "$regen_only" = "false" ]; then
  [ -n "$base_image" ] || base_image="$(grep -m1 '^FROM ' "$dockerfile" | awk '{print $2}')"
  echo "Base image: $base_image"

  rm -rf "$work"
  mkdir -p "$work/pristine" "$work/patched"

  cid="$(docker create "$base_image")"
  trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' EXIT

  for entry in "${patch_targets[@]}"; do
    file="${entry#*:}"
    mkdir -p "$work/pristine/$(dirname "$file")" "$work/patched/$(dirname "$file")"
    docker cp "$cid:/var/www/localhost/htdocs/openemr/$file" "$work/pristine/$file"
    cp "$work/pristine/$file" "$work/patched/$file"
  done

  for p in "$overlay"/patches/*.patch; do
    echo "Applying $(basename "$p")"
    patch -p1 -d "$work/patched" --no-backup-if-mismatch < "$p"
  done
fi

if [ ! -d "$work/patched" ]; then
  echo "No $work/patched tree; run without --regen-only first." >&2
  exit 1
fi

mkdir -p "$overlay/patches"
for entry in "${patch_targets[@]}"; do
  name="${entry%%:*}"
  file="${entry#*:}"
  diff -u \
    --label "a/$file" \
    --label "b/$file" \
    "$work/pristine/$file" "$work/patched/$file" \
    > "$overlay/patches/$name" || true
  if [ -s "$overlay/patches/$name" ]; then
    echo "Wrote openemr/patches/$name"
  else
    echo "Note: $name is empty (no changes for $file)" >&2
  fi
done

echo "Done. Review openemr/patches/ and rebuild the image."
