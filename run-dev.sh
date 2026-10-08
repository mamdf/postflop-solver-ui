#!/usr/bin/env bash
# Dev stack: postflop-solver-api (:3001, reused if already healthy) + webpack dev server.
# Only what this script starts is stopped on exit.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "${ROOT_DIR}/../../adapters/rust/postflop-solver-api" && pwd)"
PORT="${PORT:-5174}"
UI_HOST="${UI_HOST:-127.0.0.1}"         # UI bind; a VPS passes its tailnet name
API_EXPLICIT="${API_URL:+1}"            # an explicit API_URL is never started here
export API_URL="${API_URL:-http://127.0.0.1:3001}"

# Supervisors (tmux/systemd/poker-infra) start with a bare PATH: add cargo and mise's node.
export PATH="${HOME}/.cargo/bin:${HOME}/.local/share/mise/shims:${PATH}"

API_PID=""
UI_PID=""

kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "${pid}" 2>/dev/null || true); do kill_tree "${child}"; done
  kill "${pid}" 2>/dev/null || true
}

cleanup() {
  set +e
  trap - EXIT INT TERM
  local pid
  for pid in ${UI_PID} ${API_PID}; do kill_tree "${pid}"; done
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

api_ok() { curl -fsS --max-time 2 "${API_URL}/health" >/dev/null 2>&1; }

command -v node >/dev/null || { echo "[dev] ERROR: node not found on PATH" >&2; exit 1; }
[[ -d "${ROOT_DIR}/node_modules" ]] || { echo "[dev] ERROR: run 'just setup' first" >&2; exit 1; }
if ss -tln "sport = :${PORT}" | grep -q LISTEN; then
  echo "[dev] ERROR: port ${PORT} is already in use" >&2; exit 1
fi

if api_ok; then
  echo "[dev] solver API already healthy at ${API_URL} — reusing it"
elif [[ -n "${API_EXPLICIT}" ]]; then
  echo "[dev] WARNING: ${API_URL} is not healthy; not starting it (explicit API_URL)" >&2
else
  echo "[dev] starting postflop-solver-api on ${API_URL} (first run compiles the release build)"
  (cd "${API_DIR}" && exec cargo run --release -- serve --host 127.0.0.1 --port 3001) &
  API_PID=$!
fi

echo "[dev] starting UI on http://${UI_HOST}:${PORT}"
(cd "${ROOT_DIR}" && exec npm run dev -- --host "${UI_HOST}" --port "${PORT}") &
UI_PID=$!

wait_status=0
wait -n ${API_PID} ${UI_PID} || wait_status=$?
echo "[dev] a service exited (status ${wait_status}) — stopping the rest." >&2
exit "${wait_status}"
