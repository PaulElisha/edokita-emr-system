#!/usr/bin/env bash
# @format
#
# Regenerate the OpenEMR core-file patches from the pinned base image.
#
# The extension layers two things onto the stock OpenEMR image:
#   1. NEW files (services/controllers OpenEMR does not ship) - copied as-is.
#   2. PATCHES applied to upstream CORE files at build time.
#
# Keeping the patches (rather than frozen copies of whole core files) means an
# OpenEMR version bump is a re-apply, not a manual 3-way merge. This script is
# the maintenance tool for that:
#
#   * default        - extract pristine core files from the base image, re-apply
#                      the current patches onto a copy, and rewrite the patches
#                      as pristine -> patched. Run this after bumping the pinned
#                      digest so the patch headers stay aligned with upstream.
#   * --regen-only   - skip extraction/apply and just re-diff the existing
#                      .work/ tree (use after resolving conflicts by hand).
#
# Upgrade workflow:
#   1. Bump the digest in Dockerfile.
#   2. Run: openemr/regenerate-patches.sh
#   3. If a hunk fails, edit the files under openemr/.work/patched/ to resolve,
#      then run: openemr/regenerate-patches.sh --regen-only
#   4. Rebuild: docker compose build openemr
#
set -euo pipefail

overlay="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$overlay/.." && pwd)"
dockerfile="$repo_root/Dockerfile"
work="$overlay/.work"

# Patch file -> core file it targets (both relative to the OpenEMR web root).
patch_targets=(
  "0001-add-lab-standard-routes.patch:apis/routes/_rest_routes_standard.inc.php"
  "0002-register-lab-scopes.patch:src/Common/Auth/OpenIDConnect/Entities/ServerScopeListEntity.php"
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
