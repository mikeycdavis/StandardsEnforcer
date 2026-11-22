#!/usr/bin/env bash
# ST-21 — report the oracle credential as its own named condition.
#
# Before this step, a missing or insufficient credential surfaced only downstream, as "no git
# repository at .oracle" or an unresolved release, which is indistinguishable from an oracle that is
# genuinely absent or a release that genuinely does not exist. This probes the oracle remote with
# the credential the checkout is about to use and reports which of three things is true:
#
#   exit 0  ORACLE-CREDENTIAL-OK           the remote answered; which credential was used is printed
#   exit 1  ORACLE-CREDENTIAL-UNAVAILABLE  the remote refused the credential (or hid the repository
#                                          from it; GitHub reports a private repository the caller
#                                          cannot read as "not found", so that is reported as the
#                                          credential condition it is indistinguishable from)
#   exit 3  ORACLE-DEDICATED-CREDENTIAL-MISSING  ENFORCER_REQUIRE_DEDICATED is set (trusted workflow only) and the run has no dedicated credential
#   exit 2  ORACLE-REMOTE-UNREACHABLE      the probe failed for a reason that is not a credential
#
# The fallback to the workflow's own `github.token` when no `ENFORCER_ORACLE_TOKEN` is set is KEPT,
# as an explicit and reported choice rather than a silent one (ST-21 criterion 2): it is correct for
# a public oracle, and the line below names it every run so it can never be mistaken for the
# dedicated token. A private oracle with only the fallback fails here, as the credential condition.
#
# WHO MAY HOLD THE DEDICATED SECRET. Only a trusted post-merge workflow on protected main sets
# ENFORCER_ORACLE_TOKEN for this script (see .github/workflows/oracle-authoritative.yml, enforced by
# test/oracle-secret-isolation.test.mjs). A pull-request run supplies only ENFORCER_FALLBACK_TOKEN,
# and every run names the credential mode and whether the result is AUTHORITATIVE.
#
# The credential is passed to git as an http.extraheader through GIT_CONFIG_* variables and never put
# in the URL. env(1) carries the header value in its own argv for an instant before it execs git, so
# it is visible to the runner user only; the token reaches this script solely in the trusted
# workflow. The derived header is masked in the Actions log.
set -Eeuo pipefail

REMOTE="${ENFORCER_ORACLE_REMOTE:-}"
URL="${ENFORCER_ORACLE_URL:-https://github.com/${REMOTE}.git}"

emit() { # emit <level> <message>   level: error|notice
  if [ -n "${GITHUB_ACTIONS:-}" ]; then printf '::%s::%s\n' "$1" "$2"; else printf '%s\n' "$2"; fi
}

if [ -z "$REMOTE" ] && [ -z "${ENFORCER_ORACLE_URL:-}" ]; then
  if [ -n "${ENFORCER_REQUIRE_DEDICATED:-}" ] && [ -z "${ENFORCER_ORACLE_TOKEN:-}" ]; then
    emit error "ORACLE-DEDICATED-CREDENTIAL-MISSING: this run must be authoritative but neither a remote nor the dedicated credential is configured."
    exit 3
  fi
  printf 'ORACLE-CREDENTIAL-NOT-EXERCISED  ENFORCER_ORACLE_REMOTE is unset; no oracle is obtained and the required-oracle guard will fail\n'
  exit 0
fi

if [ -n "${ENFORCER_ORACLE_TOKEN:-}" ]; then
  TOKEN="$ENFORCER_ORACLE_TOKEN"; SOURCE="ENFORCER_ORACLE_TOKEN (dedicated secret)"
  MODE="dedicated"; AUTHORITY="AUTHORITATIVE"
  # Defence in depth: the dedicated credential only earns the label in a push to main. Anywhere else
  # under Actions the label is withheld even though the credential is present.
  if [ -n "${GITHUB_ACTIONS:-}" ] && { [ "${GITHUB_EVENT_NAME:-}" != "push" ] || [ "${GITHUB_REF:-}" != "refs/heads/main" ]; }; then
    AUTHORITY="NON-AUTHORITATIVE (the dedicated credential is present outside a push to main)"
  fi
elif [ -n "${ENFORCER_FALLBACK_TOKEN:-}" ]; then
  TOKEN="$ENFORCER_FALLBACK_TOKEN"; SOURCE="the workflow github.token FALLBACK (ENFORCER_ORACLE_TOKEN is not set)"
  MODE="fallback"; AUTHORITY="NON-AUTHORITATIVE"
else
  TOKEN=""; SOURCE="no credential at all (neither ENFORCER_ORACLE_TOKEN nor a fallback)"
  MODE="none"; AUTHORITY="NON-AUTHORITATIVE"
fi
printf 'oracle credential source: %s\n' "$SOURCE"
printf 'oracle credential mode: %s\n' "$MODE"
printf 'oracle result authority: %s\n' "$AUTHORITY"
# The trusted post-merge workflow sets ENFORCER_REQUIRE_DEDICATED=1. A run that is supposed to be
# authoritative but has no dedicated credential must fail by name, not go green on the fallback.
if [ -n "${ENFORCER_REQUIRE_DEDICATED:-}" ] && [ "$MODE" != "dedicated" ]; then
  emit error "ORACLE-DEDICATED-CREDENTIAL-MISSING: this run must be authoritative but credential mode is '$MODE'. Set ENFORCER_ORACLE_TOKEN as a secret of the oracle-authoritative environment (deployment branches restricted to main). This is not an absent oracle and not an unresolved release."
  exit 3
fi
if [ "$AUTHORITY" != "AUTHORITATIVE" ]; then
  emit notice "ORACLE-RESULT-NON-AUTHORITATIVE: this run used credential mode '$MODE'. The dedicated oracle credential is available only to the post-merge workflow on protected main, so a result obtained here is NON-AUTHORITATIVE where the credential cannot read the oracle."
fi

# No --exit-code and no ref pattern: `--exit-code` returns 2 when the pattern matches nothing, which
# would report a VALID credential against an empty or unborn-HEAD repository as unreachable. This
# probe answers one question only (can this credential read the remote?); whether the pinned
# releases exist is the oracle-readiness stage's job.
args=(ls-remote "$URL")
env_pairs=(GIT_TERMINAL_PROMPT=0)
if [ -n "$TOKEN" ]; then
  header="$(printf 'x-access-token:%s' "$TOKEN" | base64 | tr -d '\n')"
  [ -n "${GITHUB_ACTIONS:-}" ] && printf '::add-mask::%s\n' "$header"
  # Scoped to github.com, as actions/checkout scopes it, so a redirect elsewhere never receives it.
  # Never run this script under `set -x` / `bash -x`: the trace would print the token and header.
  env_pairs+=(GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.https://github.com/.extraheader "GIT_CONFIG_VALUE_0=AUTHORIZATION: basic $header")
fi

set +e
out="$(env "${env_pairs[@]}" git "${args[@]}" 2>&1)"
rc=$?
set -e

if [ "$rc" -eq 0 ]; then
  printf 'ORACLE-CREDENTIAL-OK  %s answered using %s (%s)\n' "$URL" "$SOURCE" "$AUTHORITY"
  exit 0
fi

if printf '%s' "$out" | grep -qiE 'authentication failed|bad credentials|invalid username or token|could not read (username|password)|error: 40[13]|returned error: 40[13]|requested url returned error: 40[13]|repository not found'; then
  emit error "ORACLE-CREDENTIAL-UNAVAILABLE: the oracle remote refused or could not be read with ${SOURCE}. This is a credential problem, not an absent oracle and not an unresolved release (GitHub reports a repository the credential cannot read as not found, so also check that ${REMOTE:-the oracle remote} is spelled correctly). Result is ${AUTHORITY}. The dedicated ENFORCER_ORACLE_TOKEN (read access to ${REMOTE:-the oracle remote}) is available only to the post-merge workflow on protected main; a pull-request run cannot supply it."
  printf '%s\n' "$out" | sed 's/^/  git: /'
  exit 1
fi

emit error "ORACLE-REMOTE-UNREACHABLE: the oracle remote could not be probed for a reason that is not a credential refusal. This is not an absent oracle and not an unresolved release."
printf '%s\n' "$out" | sed 's/^/  git: /'
exit 2
