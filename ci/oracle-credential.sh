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
#   exit 2  ORACLE-REMOTE-UNREACHABLE      the probe failed for a reason that is not a credential
#
# The fallback to the workflow's own `github.token` when no `ENFORCER_ORACLE_TOKEN` is set is KEPT,
# as an explicit and reported choice rather than a silent one (ST-21 criterion 2): it is correct for
# a public oracle, and the line below names it every run so it can never be mistaken for the
# dedicated token. A private oracle with only the fallback fails here, as the credential condition.
#
# The credential is passed to git through the environment as an http.extraheader, never in argv or
# the URL, and the derived header is masked in the Actions log.
set -Eeuo pipefail

REMOTE="${ENFORCER_ORACLE_REMOTE:-}"
URL="${ENFORCER_ORACLE_URL:-https://github.com/${REMOTE}.git}"

emit() { # emit <level> <message>   level: error|notice
  if [ -n "${GITHUB_ACTIONS:-}" ]; then printf '::%s::%s\n' "$1" "$2"; else printf '%s\n' "$2"; fi
}

if [ -z "$REMOTE" ] && [ -z "${ENFORCER_ORACLE_URL:-}" ]; then
  printf 'ORACLE-CREDENTIAL-NOT-EXERCISED  ENFORCER_ORACLE_REMOTE is unset; no oracle is obtained and the required-oracle guard will fail\n'
  exit 0
fi

if [ -n "${ENFORCER_ORACLE_TOKEN:-}" ]; then
  TOKEN="$ENFORCER_ORACLE_TOKEN"; SOURCE="ENFORCER_ORACLE_TOKEN (dedicated secret)"
elif [ -n "${ENFORCER_FALLBACK_TOKEN:-}" ]; then
  TOKEN="$ENFORCER_FALLBACK_TOKEN"; SOURCE="the workflow github.token FALLBACK (ENFORCER_ORACLE_TOKEN is not set)"
else
  TOKEN=""; SOURCE="no credential at all (neither ENFORCER_ORACLE_TOKEN nor a fallback)"
fi
printf 'oracle credential source: %s\n' "$SOURCE"

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
  printf 'ORACLE-CREDENTIAL-OK  %s answered using %s\n' "$URL" "$SOURCE"
  exit 0
fi

if printf '%s' "$out" | grep -qiE 'authentication failed|bad credentials|invalid username or token|could not read (username|password)|error: 40[13]|returned error: 40[13]|requested url returned error: 40[13]|repository not found'; then
  emit error "ORACLE-CREDENTIAL-UNAVAILABLE: the oracle remote refused or could not be read with ${SOURCE}. This is a credential problem, not an absent oracle and not an unresolved release (GitHub reports a repository the credential cannot read as not found, so also check that ${REMOTE:-the oracle remote} is spelled correctly). Set a valid ENFORCER_ORACLE_TOKEN repository secret with read access to ${REMOTE:-the oracle remote}."
  printf '%s\n' "$out" | sed 's/^/  git: /'
  exit 1
fi

emit error "ORACLE-REMOTE-UNREACHABLE: the oracle remote could not be probed for a reason that is not a credential refusal. This is not an absent oracle and not an unresolved release."
printf '%s\n' "$out" | sed 's/^/  git: /'
exit 2
