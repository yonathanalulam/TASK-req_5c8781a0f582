#!/usr/bin/env bash
#
# Dockerized test orchestrator for the Offline Lease & Service Operations Portal.
# Runs backend (Jest), frontend (Vitest), and fullstack E2E tests without
# requiring any host-side `npm install` or local MongoDB.
#
# Exit codes:
#   0  all stages passed
#   1+ one or more stages failed (first failing stage's exit code is propagated)
#
# Usage:
#   ./run_tests.sh                # run backend + frontend + e2e
#   ./run_tests.sh backend        # run only backend
#   ./run_tests.sh frontend       # run only frontend
#   ./run_tests.sh e2e            # run only e2e
#   SKIP_E2E=1 ./run_tests.sh     # skip e2e stage
#
set -u
set -o pipefail

cd "$(dirname "$0")"

if command -v docker >/dev/null 2>&1; then :; else
  echo "ERROR: docker is required but was not found in PATH." >&2
  exit 127
fi

COMPOSE="docker compose"
if ! $COMPOSE version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    echo "ERROR: neither 'docker compose' nor 'docker-compose' is available." >&2
    exit 127
  fi
fi

COMPOSE_FILE="docker-compose.test.yml"
PROJECT="offline-ops-tests"
BASE=($COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE")

STAGES=("${1:-all}")
EXIT=0

log()   { printf "\n\033[1;34m[run_tests] %s\033[0m\n" "$*"; }
stage() { printf "\n\033[1;36m==== %s ====\033[0m\n" "$*"; }
err()   { printf "\033[1;31m[run_tests] %s\033[0m\n" "$*" >&2; }

cleanup() {
  log "Tearing down test containers and volumes"
  "${BASE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

run_stage() {
  local name="$1"; shift
  stage "Stage: $name"
  if ! "$@"; then
    err "Stage '$name' failed."
    EXIT=1
    return 1
  fi
  log "Stage '$name' passed."
}

want() {
  local s="$1"
  [[ "${STAGES[0]}" == "all" ]] && return 0
  [[ "${STAGES[0]}" == "$s" ]]
}

backend_stage() {
  "${BASE[@]}" run --rm --no-deps mongo-test >/dev/null 2>&1 || true
  "${BASE[@]}" up --build --abort-on-container-exit --exit-code-from backend-test \
    mongo-test backend-test
}

frontend_stage() {
  "${BASE[@]}" run --rm --no-deps frontend-test
}

e2e_stage() {
  "${BASE[@]}" up --build --abort-on-container-exit --exit-code-from e2e-tests \
    mongo-test e2e-app e2e-frontend e2e-tests
}

if want all || want backend; then
  run_stage "Backend HTTP/integration tests (Jest)" backend_stage || true
fi

if want all || want frontend; then
  run_stage "Frontend unit tests (Vitest)" frontend_stage || true
fi

if [[ "${SKIP_E2E:-}" != "1" ]] && (want all || want e2e); then
  run_stage "FE <-> BE E2E tests (Jest)" e2e_stage || true
fi

if [[ $EXIT -ne 0 ]]; then
  err "One or more test stages FAILED."
  exit $EXIT
fi

log "All requested test stages PASSED."
exit 0
