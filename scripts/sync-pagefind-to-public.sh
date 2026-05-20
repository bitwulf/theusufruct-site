#!/usr/bin/env bash
# Copy the freshly-built Pagefind index from dist/_pagefind/ to public/_pagefind/
# so that `astro dev` can serve it. (Dev mode only serves src/ + public/; it
# does not see dist/, so without this copy the /search page can't load the index.)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT_DIR}/dist/_pagefind"
DST="${ROOT_DIR}/public/_pagefind"

if [ ! -d "${SRC}" ]; then
  echo "[sync-pagefind] WARNING: ${SRC} not found — skipping. Run a build first." >&2
  exit 0
fi

rm -rf "${DST}"
mkdir -p "${DST}"
cp -R "${SRC}/." "${DST}/"
echo "[sync-pagefind] mirrored $(find "${DST}" -type f | wc -l | tr -d ' ') files into public/_pagefind/"
