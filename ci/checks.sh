#!/usr/bin/env bash
#
# THE AUTHORITATIVE CI CHECK LIST FOR THIS REPOSITORY.
#
# This file is the only place the checks are named. `scripts/ci.*` builds a container and runs
# this; `.github/workflows/ci.yml` runs this same file on a hosted runner. Neither restates the
# commands, so local CI and GitHub CI cannot drift into disagreeing about what "passed" meant.
#
# It runs with the source at /work (baked into the image, so it is exactly the commit under test)
# and the authoritative standards oracle mounted read-only at /oracle. It reaches no network.
#
# ON THE SHAPE OF THIS FILE. It is a list of stages and almost nothing else, on purpose. Logic
# here is logic that GitHub and the developer's machine execute differently the day one of them
# has a different bash. The only decision it makes is pass/fail, and it makes that by letting
# commands fail.

set -Eeuo pipefail

# Resolved from this script's own location rather than hardcoded to the container's /work, so the
# same file runs unchanged on a hosted runner, in the container, and from a developer's shell.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${CI_OUT_DIR:-/out}"
COMMIT="${CI_COMMIT:-unknown}"
BRANCH="${CI_BRANCH:-unknown}"
REPOSITORY="${CI_REPOSITORY:-unknown}"
SOURCE="${CI_SOURCE:-unknown}"
ORACLE="${ENFORCER_ORACLE_REPO:-/oracle}"

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG_DIR="$(mktemp -d)"
TEST_LOG="$LOG_DIR/test.log"

STAGES=()
CURRENT=""
RESULT="failed"
FAILED_STAGE=""
PASS_COUNT=""
FAIL_COUNT=""
SKIP_COUNT=""

# ---------------------------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------------------------

say()  { printf '%s\n' "$*"; }
rule() { printf -- '---------------------------------------------------------------------------\n'; }

stage() {
  CURRENT="$1"
  rule
  say "CHECK  $1"
  rule
}

done_stage() {
  STAGES+=("$CURRENT")
  say "   ok  $CURRENT"
  say ""
  CURRENT=""
}

# `jq` is not installed and will not be: one more thing to differ between environments, for a
# document this small. Escaping is limited to what actually appears here — SHAs, branch names,
# stage identifiers and ISO timestamps.
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

emit_result() {
  local completed_at checks first s
  completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  checks=""
  first=1
  for s in ${STAGES[@]+"${STAGES[@]}"}; do
    if [ "$first" -eq 1 ]; then first=0; else checks="$checks,"; fi
    checks="$checks
    \"$(json_escape "$s")\""
  done

  mkdir -p "$OUT_DIR"
  cat > "$OUT_DIR/latest.json" <<JSON
{
  "schema": "local-ci/1",
  "repository": "$(json_escape "$REPOSITORY")",
  "branch": "$(json_escape "$BRANCH")",
  "commit": "$(json_escape "$COMMIT")",
  "source": "$(json_escape "$SOURCE")",
  "result": "$(json_escape "$RESULT")",
  "environment": "docker",
  "failedCheck": $( [ -n "$FAILED_STAGE" ] && printf '"%s"' "$(json_escape "$FAILED_STAGE")" || printf 'null' ),
  "startedAt": "$STARTED_AT",
  "completedAt": "$completed_at",
  "tests": {
    "passed": ${PASS_COUNT:-null},
    "failed": ${FAIL_COUNT:-null},
    "skipped": ${SKIP_COUNT:-null}
  },
  "checks": [$checks
  ]
}
JSON
}

on_exit() {
  local code=$?
  if [ "$code" -ne 0 ] && [ -z "$FAILED_STAGE" ]; then
    FAILED_STAGE="${CURRENT:-unknown}"
  fi
  emit_result

  rule
  if [ "$RESULT" = "passed" ]; then
    say "LOCAL CI: PASS"
  else
    say "LOCAL CI: FAIL"
    say "Failed check: ${FAILED_STAGE:-unknown}"
  fi
  say "Repository:      $REPOSITORY"
  say "Branch:          $BRANCH"
  say "Verified commit: $COMMIT"
  say "Source:          $SOURCE"
  say "Environment:     Docker (local). This is NOT a GitHub Actions result."
  say "Checks executed: ${STAGES[*]:-none}"
  if [ -n "$PASS_COUNT" ]; then
    # Never "all tests passed". The skip count is part of the result, not a footnote: this
    # repository has already shipped one green suite whose subject was absent.
    say "Tests:           ${PASS_COUNT} passed, ${FAIL_COUNT:-?} failed, ${SKIP_COUNT:-?} skipped"
  fi
  say "Completed:       $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  rule
  rm -rf "$LOG_DIR"
  exit "$code"
}
trap on_exit EXIT

# ---------------------------------------------------------------------------------------------
# The checks
# ---------------------------------------------------------------------------------------------

say ""
rule
say "StandardsEnforcer — local containerised CI"
say "commit $COMMIT on $BRANCH  ($SOURCE)"
rule
say ""

# --- environment ------------------------------------------------------------------------------
# Not a check so much as the evidence that makes the rest legible. A failure below is much easier
# to read when the versions that produced it are two lines above it.
stage "environment"
say "node    $(node --version)"
say "npm     $(npm --version)"
say "git     $(git --version)"
say "user    $(id -un) ($(id -u))"
say "workdir $(pwd)"
done_stage

# --- dependency posture -----------------------------------------------------------------------
# This repository has no dependencies and no install step, and that is a decision rather than a
# stage nobody got round to writing (.github/workflows/ci.yml: "An install is a second thing that
# can differ between the machine that reviewed a release and the machine that runs it").
#
# A decision nothing checks is a decision that decays. So: asserted, not assumed. If this
# repository ever legitimately takes a dependency, this check is the place that says so out loud.
stage "no-install-invariant"
if [ -d node_modules ]; then
  say "FAIL  node_modules/ is present in the commit under test."
  FAILED_STAGE="no-install-invariant"; exit 1
fi
if node -e 'const p=require(process.cwd()+"/package.json");process.exit((p.dependencies&&Object.keys(p.dependencies).length)||(p.devDependencies&&Object.keys(p.devDependencies).length)?1:0)'; then
  say "package.json declares no dependencies and no devDependencies"
  say "node_modules/ absent — nothing to install, nothing that could differ"
else
  say "FAIL  package.json now declares dependencies, so the no-install invariant no longer holds."
  say "      That may be correct. If it is, add the install step here and to the Dockerfile,"
  say "      and record the decision — do not delete this check."
  FAILED_STAGE="no-install-invariant"; exit 1
fi
done_stage

# --- oracle readiness -------------------------------------------------------------------------
# The dependency health check. This repository's one external dependency is a real standards
# release to integrate against, and the failure mode it is most exposed to is that dependency
# being *absent* rather than *wrong* — see test-support/oracle.mjs and FE-14.
#
# Checked here, before the suite, so that "the oracle is not mounted" reports as a dependency
# failure with a fix attached, rather than as an assertion failure inside a test. The suite's own
# required-oracle guard still runs and is still the authority; this is the readiness probe, and
# it deliberately duplicates the guard rather than replacing it.
#
# Note what this is not: it is not a sleep, and it is not "the container started, so it is ready".
# It resolves the exact releases the suite pins.
stage "oracle-readiness"
if [ ! -d "$ORACLE/.git" ]; then
  say "FAIL  no git repository at $ORACLE"
  say "      The authoritative standards checkout is bind-mounted read-only by scripts/ci.*."
  say "      Point it at one with --oracle, or set ENFORCER_ORACLE_HOST_PATH."
  FAILED_STAGE="oracle-readiness"; exit 1
fi
# The tags the suite pins, read from the suite rather than restated here — a second list would be
# a second thing to forget to update.
ORACLE_TAGS="$(node -e 'import(process.cwd()+"/test-support/oracle.mjs").then(m=>console.log(m.ORACLE_TAGS.join(" ")))')"
say "oracle  $ORACLE"
for tag in $ORACLE_TAGS; do
  # rev-list -n 1, never rev-parse: an annotated tag must dereference to its commit. This is the
  # same distinction scripts/identity.mjs diagnoses by name.
  if sha="$(git -C "$ORACLE" rev-list -n 1 "$tag" 2>/dev/null)"; then
    say "  $tag -> $sha"
  else
    say "FAIL  $ORACLE does not resolve $tag"
    say "      The mounted checkout is a repository but not one that can serve this suite."
    say "      Fetch its tags, or mount a checkout that has them."
    FAILED_STAGE="oracle-readiness"; exit 1
  fi
done
done_stage

# --- the suite --------------------------------------------------------------------------------
# `npm test` verbatim: the repository's own authoritative command, not a reconstruction of it.
# ENFORCER_REQUIRE_ORACLE=1 comes from the environment and asserts that this run exercised the
# authoritative integration surface. Under it a missing oracle is a red suite, not 18 quiet skips.
stage "test-suite"
say "\$ npm test   (ENFORCER_REQUIRE_ORACLE=1, ENFORCER_ORACLE_REPO=$ORACLE)"
say ""
set +e
npm test 2>&1 | tee "$TEST_LOG"
suite_status=${PIPESTATUS[0]}
set -e

# Counts are for the report only. The verdict is the exit code — a parsed number must never be
# what decides whether CI passed.
PASS_COUNT="$(grep -oE '(^|[^[:alnum:]])pass[[:space:]]+[0-9]+' "$TEST_LOG" | tail -1 | grep -oE '[0-9]+' || true)"
FAIL_COUNT="$(grep -oE '(^|[^[:alnum:]])fail[[:space:]]+[0-9]+' "$TEST_LOG" | tail -1 | grep -oE '[0-9]+' || true)"
SKIP_COUNT="$(grep -oE '(^|[^[:alnum:]])skipped[[:space:]]+[0-9]+' "$TEST_LOG" | tail -1 | grep -oE '[0-9]+' || true)"

if [ "$suite_status" -ne 0 ]; then
  say ""
  say "FAIL  npm test exited $suite_status"
  FAILED_STAGE="test-suite"; exit "$suite_status"
fi
say ""
done_stage

RESULT="passed"
