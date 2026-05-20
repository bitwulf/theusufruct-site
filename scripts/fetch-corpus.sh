#!/usr/bin/env bash
# fetch-corpus.sh — pull a Usufruct corpus release, verify SHA-256, unzip into tmp/.
#
# Usage: scripts/fetch-corpus.sh
#   USUFRUCT_TAG=2026-05-20  pin a specific tag (default: latest)
#   USUFRUCT_FORCE=1         re-download even if already present
#
# Exits non-zero on any failure. Never silently falls back to a cached copy.
set -euo pipefail

REPO="bitwulf/Usufruct"
TAG="${USUFRUCT_TAG:-latest}"
FORCE="${USUFRUCT_FORCE:-0}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="${ROOT_DIR}/tmp"
CORPUS_DIR="${TMP_DIR}/corpus"
DL_DIR="${TMP_DIR}/downloads"

mkdir -p "${CORPUS_DIR}" "${DL_DIR}"

log() { printf '[fetch-corpus] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "missing required tool: $1"; }
need curl
need unzip
need shasum

# Resolve "latest" → concrete tag via GitHub API.
if [ "${TAG}" = "latest" ]; then
  log "resolving latest tag from github.com/${REPO}..."
  API_URL="https://api.github.com/repos/${REPO}/releases/latest"
  TAG="$(curl -fsSL "${API_URL}" \
    | grep -E '"tag_name"[[:space:]]*:' \
    | head -n1 \
    | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  [ -n "${TAG}" ] || die "could not resolve latest tag"
fi
log "target tag: ${TAG}"

ZIP_NAME="usufruct-${TAG}.zip"
SHA_NAME="${ZIP_NAME}.sha256"
BASE_URL="https://github.com/${REPO}/releases/download/${TAG}"
ZIP_URL="${BASE_URL}/${ZIP_NAME}"
SHA_URL="${BASE_URL}/${SHA_NAME}"

ZIP_PATH="${DL_DIR}/${ZIP_NAME}"
SHA_PATH="${DL_DIR}/${SHA_NAME}"
UNPACK_DIR="${CORPUS_DIR}/usufruct-${TAG}"
STAMP_FILE="${CORPUS_DIR}/.verified-${TAG}"

if [ "${FORCE}" = "1" ]; then
  log "force=1: clearing prior artifacts for ${TAG}"
  rm -f "${ZIP_PATH}" "${SHA_PATH}" "${STAMP_FILE}"
  rm -rf "${UNPACK_DIR}"
fi

if [ -f "${STAMP_FILE}" ] && [ -d "${UNPACK_DIR}" ] && [ -f "${UNPACK_DIR}/manifest.json" ]; then
  log "already verified at ${UNPACK_DIR} (set USUFRUCT_FORCE=1 to refetch)"
  # Always (re)write the active-tag pointer so dev/build agree.
  printf '%s\n' "${TAG}" > "${CORPUS_DIR}/ACTIVE_TAG"
  exit 0
fi

log "downloading ${SHA_URL}"
curl -fsSL --retry 3 --retry-delay 2 -o "${SHA_PATH}" "${SHA_URL}" \
  || die "failed to download ${SHA_URL}"

log "downloading ${ZIP_URL}"
curl -fsSL --retry 3 --retry-delay 2 -o "${ZIP_PATH}" "${ZIP_URL}" \
  || die "failed to download ${ZIP_URL}"

# Sidecar may be either "<hex>" or "<hex>  filename". Normalize and compare.
EXPECTED_SHA="$(awk '{print $1; exit}' "${SHA_PATH}")"
ACTUAL_SHA="$(shasum -a 256 "${ZIP_PATH}" | awk '{print $1}')"

if [ -z "${EXPECTED_SHA}" ] || [ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]; then
  log "expected: ${EXPECTED_SHA}"
  log "actual:   ${ACTUAL_SHA}"
  rm -f "${ZIP_PATH}"
  die "SHA-256 mismatch — refusing to unpack"
fi
log "SHA-256 verified: ${ACTUAL_SHA}"

log "unpacking into ${CORPUS_DIR}"
rm -rf "${UNPACK_DIR}"
unzip -q -o "${ZIP_PATH}" -d "${CORPUS_DIR}"

[ -f "${UNPACK_DIR}/manifest.json" ] \
  || die "unpacked archive missing manifest.json at ${UNPACK_DIR}"
[ -f "${UNPACK_DIR}/articles.jsonl" ] \
  || die "unpacked archive missing articles.jsonl"
[ -f "${UNPACK_DIR}/tree.json" ] \
  || die "unpacked archive missing tree.json"
[ -f "${UNPACK_DIR}/citation_edges.csv" ] \
  || die "unpacked archive missing citation_edges.csv"

touch "${STAMP_FILE}"
printf '%s\n' "${TAG}" > "${CORPUS_DIR}/ACTIVE_TAG"
log "ok — corpus available at ${UNPACK_DIR}"
