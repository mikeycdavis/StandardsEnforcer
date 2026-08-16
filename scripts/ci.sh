#!/usr/bin/env bash
#
# Run this repository's complete CI pipeline locally, in Docker.
#
# The POSIX twin of scripts/ci.ps1. The two orchestrate; they do not decide. Every check that
# makes up "CI passed" is in ci/checks.sh, which both of them run inside the container, so these
# two scripts cannot drift into verifying different things — the worst they can do is fail to
# start the same pipeline.
#
#   ./scripts/ci.sh [--working-tree] [--keep-on-failure] [--verbose] [--oracle=PATH]
#
# Exit 0 means every check passed. Anything else means it did not.

set -Eeuo pipefail

WORKING_TREE=0
KEEP_ON_FAILURE=0
VERBOSE=0
ORACLE="${ENFORCER_ORACLE_HOST_PATH:-}"

usage() {
  sed -n '3,14p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

for arg in "$@"; do
  case "$arg" in
    --working-tree)     WORKING_TREE=1 ;;
    --keep-on-failure)  KEEP_ON_FAILURE=1 ;;
    --verbose)          VERBOSE=1 ;;
    --oracle=*)         ORACLE="${arg#*=}" ;;
    -h|--help)          usage 0 ;;
    *) printf '!!! unknown option: %s\n\n' "$arg" >&2; usage 2 ;;
  esac
done

cyan()  { printf '\033[36m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
step()  { cyan "==> $*"; }
fail()  { red  "!!! $*"; }

# ---------------------------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------------------------

for tool in git docker tar; do
  command -v "$tool" >/dev/null 2>&1 || { fail "$tool is required and was not found on PATH."; exit 127; }
done
docker compose version >/dev/null 2>&1 || { fail 'Docker Compose v2 is required.'; exit 127; }
docker info >/dev/null 2>&1 || { fail 'The Docker daemon is not reachable.'; exit 127; }

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { fail 'Not inside a git repository.'; exit 2; }
REPO_NAME="$(basename "$REPO_ROOT")"
COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null)" || { fail 'HEAD does not resolve to a commit.'; exit 2; }
BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
SOURCE=$([ "$WORKING_TREE" -eq 1 ] && echo working-tree || echo commit)

# ---------------------------------------------------------------------------------------------
# The oracle — this repository's one external dependency. Resolved on the host so a wrong path is
# a clear message here rather than a mount that silently appears empty inside the container.
# ---------------------------------------------------------------------------------------------

[ -n "$ORACLE" ] || ORACLE="$(dirname "$REPO_ROOT")/MachineLearningStandards"
if [ ! -d "$ORACLE/.git" ]; then
  fail "No git repository at the oracle path: $ORACLE"
  echo
  echo 'Local CI runs the authoritative integration suite, which needs a real standards release'
  echo 'to run against. A synthetic one does not satisfy it, by design (FE-14).'
  echo
  echo 'Point at a checkout with:   ./scripts/ci.sh --oracle=<path>'
  echo 'or set ENFORCER_ORACLE_HOST_PATH.'
  exit 3
fi
ORACLE="$(cd "$ORACLE" && pwd)"

# ---------------------------------------------------------------------------------------------
# Uniquely named ephemeral resources. Nothing below may name, touch or remove a resource this run
# did not create.
# ---------------------------------------------------------------------------------------------

SLUG="$(printf '%s' "$REPO_NAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9' | cut -c1-24)"
PROJECT="localci-${SLUG}-${COMMIT:0:12}-$$"
IMAGE="local-ci/${SLUG}:${COMMIT}"
STAGE_DIR="${TMPDIR:-/tmp}/localci-stage-${PROJECT}"
OUT_DIR="$REPO_ROOT/artifacts/local-ci"
COMPOSE=(docker compose -p "$PROJECT" -f "$REPO_ROOT/compose.ci.yml")
CLEANED=0
EXIT_CODE=1

cleanup() {
  [ "$CLEANED" -eq 1 ] && return 0
  CLEANED=1
  step 'Cleaning up'

  # Scoped to this run's compose project. It cannot reach a container, network or volume that
  # belongs to anything else, including a concurrent run of this same pipeline.
  "${COMPOSE[@]}" down --volumes --remove-orphans --timeout 10 >/dev/null 2>&1 || true

  if [ "$EXIT_CODE" -eq 0 ] || [ "$KEEP_ON_FAILURE" -eq 0 ]; then
    rm -rf "$STAGE_DIR"
    # Only the image this run tagged. `docker image prune` is never called: it reaches images
    # that have nothing to do with this repository.
    docker image rm -f "$IMAGE" >/dev/null 2>&1 || true
  else
    echo
    echo "Kept for debugging (--keep-on-failure):"
    echo "  image        $IMAGE"
    echo "  staged src   $STAGE_DIR"
    echo
    echo "  Shell into the failed environment:"
    echo "    docker run --rm -it --entrypoint bash -v \"$ORACLE:/oracle:ro\" $IMAGE"
    echo
    echo "  Remove it when you are done:"
    echo "    docker image rm -f $IMAGE"
  fi
}
trap cleanup EXIT INT TERM

echo
cyan '==========================================================================='
cyan " Local CI — $REPO_NAME"
echo  " branch $BRANCH"
echo  " commit $COMMIT"
echo  " source $SOURCE"
echo  " oracle $ORACLE"
cyan '==========================================================================='
echo

# --- stage the source under test ---------------------------------------------------------------
step "Staging source ($SOURCE)"
rm -rf "$STAGE_DIR"; mkdir -p "$STAGE_DIR"

if [ "$WORKING_TREE" -eq 1 ]; then
  # Tracked plus untracked-but-not-ignored: an uncommitted new file is included, an ignored one
  # is not.
  git -C "$REPO_ROOT" ls-files --cached --others --exclude-standard -z \
    | while IFS= read -r -d '' f; do
        [ -f "$REPO_ROOT/$f" ] || continue
        mkdir -p "$STAGE_DIR/$(dirname "$f")"
        cp -p "$REPO_ROOT/$f" "$STAGE_DIR/$f"
      done
else
  # The exact committed tree. No working-tree state can leak in, which is what makes the verified
  # SHA mean anything at all.
  git -C "$REPO_ROOT" archive --format=tar "$COMMIT" | tar -x -C "$STAGE_DIR"
fi

[ -f "$STAGE_DIR/ci/checks.sh" ] || {
  fail 'ci/checks.sh is not present in the staged source. It must be committed before CI can run it.'
  exit 1
}

# --- evidence directory -------------------------------------------------------------------------
mkdir -p "$OUT_DIR"
# A stale result must not be readable as this run's. If this run dies before writing one, the
# absence is the honest record, and ci/verify.mjs refuses on absence.
rm -f "$OUT_DIR/latest.json"

export CI_PROJECT="$PROJECT" CI_CONTEXT="$STAGE_DIR" CI_IMAGE="$IMAGE" \
       CI_ORACLE_PATH="$ORACLE" CI_OUT_PATH="$OUT_DIR" CI_COMMIT="$COMMIT" \
       CI_BRANCH="$BRANCH" CI_REPOSITORY="$REPO_NAME" CI_SOURCE="$SOURCE"

# --- build ---------------------------------------------------------------------------------------
step 'Building the CI image'
if [ "$VERBOSE" -eq 1 ]; then
  "${COMPOSE[@]}" build --progress plain ci
else
  "${COMPOSE[@]}" build ci
fi

# --- run -----------------------------------------------------------------------------------------
# `run` rather than `up`, so the pipeline's exit code is this command's exit code. When this
# compose file grows service dependencies, `run` still honours their `service_healthy` conditions
# — the wait is a real health check, never a sleep.
step 'Running the pipeline'
echo
set +e
"${COMPOSE[@]}" run --rm --no-TTY ci
EXIT_CODE=$?
set -e

# --- bind the result back to what was staged -------------------------------------------------------
# The container reports the commit it was told it was running; this confirms that report agrees
# with what was actually archived, so a mislabelled result cannot become the record.
RESULT_FILE="$OUT_DIR/latest.json"
if [ "$EXIT_CODE" -eq 0 ]; then
  if [ ! -f "$RESULT_FILE" ]; then
    fail 'The pipeline reported success but wrote no result. Treating as a failure.'
    EXIT_CODE=1
  elif ! grep -q "\"commit\": \"$COMMIT\"" "$RESULT_FILE" || ! grep -q '"result": "passed"' "$RESULT_FILE"; then
    fail 'The recorded result does not match this run. Treating as a failure.'
    EXIT_CODE=1
  fi
fi

cleanup

echo
if [ "$EXIT_CODE" -eq 0 ]; then
  green "LOCAL CI PASS  $COMMIT"
  echo "Result: $RESULT_FILE"
else
  fail "LOCAL CI FAIL (exit $EXIT_CODE)"
fi
echo

exit "$EXIT_CODE"
