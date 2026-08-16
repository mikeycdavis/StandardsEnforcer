#!/usr/bin/env bash
#
# Verify the current commit with local Docker CI, then push exactly that commit and open a PR.
#
# Enforces one invariant:
#
#     A pull request may only be submitted if the exact commit SHA being pushed has successfully
#     passed the repository's complete containerized CI pipeline.
#
# The order matters: record HEAD, run the full pipeline, resolve HEAD again, refuse if it moved,
# then push that SHA by name rather than pushing "the branch".
#
# This never commits, amends, stashes or force-pushes. A dirty tree stops it; making the pipeline
# pass is the developer's job, not this script's.
#
#   ./scripts/submit-pr.sh [--base=BRANCH] [--title=TEXT] [--body=TEXT|--body-file=PATH]
#                          [--draft] [--remote=NAME] [--allow-dirty]

set -Eeuo pipefail

BASE=""; TITLE=""; BODY=""; BODY_FILE=""; DRAFT=0; REMOTE="origin"; ALLOW_DIRTY=0

for arg in "$@"; do
  case "$arg" in
    --base=*)      BASE="${arg#*=}" ;;
    --title=*)     TITLE="${arg#*=}" ;;
    --body=*)      BODY="${arg#*=}" ;;
    --body-file=*) BODY_FILE="${arg#*=}" ;;
    --remote=*)    REMOTE="${arg#*=}" ;;
    --draft)       DRAFT=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    -h|--help)     sed -n '3,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf '!!! unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

cyan()  { printf '\033[36m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
step()  { cyan "==> $*"; }
fail()  { red  "!!! $*"; }

# --- 1. a git repository -------------------------------------------------------------------------
command -v git >/dev/null 2>&1 || { fail 'git is required.'; exit 127; }
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { fail 'Not inside a git repository.'; exit 2; }

# --- 2. a branch that may be submitted -------------------------------------------------------------
BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" != "HEAD" ] || { fail 'HEAD is detached. Check out a branch before submitting.'; exit 2; }

# Asked, not assumed: "main" is a convention, and guessing it wrong is how a script pushes to the
# wrong place.
DEFAULT_BRANCH="$(git -C "$REPO_ROOT" symbolic-ref --quiet "refs/remotes/$REMOTE/HEAD" 2>/dev/null | sed 's#.*/##')"
[ -n "$DEFAULT_BRANCH" ] || DEFAULT_BRANCH="main"
[ -n "$BASE" ] || BASE="$DEFAULT_BRANCH"

if [ "$BRANCH" = "$BASE" ] || [ "$BRANCH" = "$DEFAULT_BRANCH" ] || [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  fail "Refusing to submit from '$BRANCH': it is a default or base branch."
  echo 'Create a feature branch and submit from that.'
  exit 2
fi

# --- 3. a clean working tree -----------------------------------------------------------------------
# CI verifies the committed tree, so uncommitted work is neither tested nor pushed.
DIRTY="$(git -C "$REPO_ROOT" status --porcelain)"
if [ -n "$DIRTY" ] && [ "$ALLOW_DIRTY" -eq 0 ]; then
  fail 'The working tree is dirty. Commit or stash before submitting.'
  echo; printf '%s\n' "$DIRTY" | sed 's/^/  /'; echo
  echo 'Local CI verifies the committed tree, so these changes would be neither tested nor pushed.'
  echo 'Use --allow-dirty only if you are certain they are not part of this pull request.'
  exit 2
fi

# --- 4. record HEAD before verification --------------------------------------------------------------
HEAD_BEFORE="$(git -C "$REPO_ROOT" rev-parse HEAD)"
SUBJECT="$(git -C "$REPO_ROOT" log -1 --pretty=%s)"

echo
cyan '==========================================================================='
cyan ' Verified pull request submission'
echo  " branch  $BRANCH  ->  $BASE"
echo  " commit  $HEAD_BEFORE"
cyan '==========================================================================='

# --- 5-6. run the authoritative pipeline; stop on failure ---------------------------------------------
step 'Running local CI'
set +e
"$REPO_ROOT/scripts/ci.sh"
CI_EXIT=$?
set -e

if [ "$CI_EXIT" -ne 0 ]; then
  echo
  fail 'CI failed. No branch was pushed and no PR was created.'
  exit 1
fi

# --- 7-8. resolve HEAD again and refuse if it moved ----------------------------------------------------
# The comparison lives in ci/verify.mjs and is unit-tested in test/local-ci-verify.test.mjs, because
# a guard nothing tests is a guard that fails open. It runs in a container so enforcing this needs
# no Node on the developer's machine.
HEAD_AFTER="$(git -C "$REPO_ROOT" rev-parse HEAD)"

step 'Verifying the commit to be pushed is the commit that passed'
set +e
docker run --rm --network none \
  -v "$REPO_ROOT/ci:/ci:ro" \
  -v "$REPO_ROOT/artifacts/local-ci:/evidence:ro" \
  node:20-bookworm-slim \
  node /ci/verify.mjs --evidence=/evidence/latest.json --head="$HEAD_AFTER" --branch="$BRANCH"
VERIFY_EXIT=$?
set -e

if [ "$VERIFY_EXIT" -ne 0 ]; then
  echo
  fail 'Verification refused this submission. Nothing was pushed and no PR was created.'
  exit 1
fi

# --- 9. push the exact verified commit -------------------------------------------------------------------
# `<sha>:refs/heads/<branch>` rather than `git push <remote> <branch>`. The two are the same only as
# long as nothing moved the branch, and "nothing moved" is the assumption this script exists to stop
# making.
git -C "$REPO_ROOT" remote get-url "$REMOTE" >/dev/null 2>&1 || { fail "No such remote: $REMOTE"; exit 2; }

step "Pushing $HEAD_AFTER to $REMOTE/$BRANCH"
git -C "$REPO_ROOT" push "$REMOTE" "$HEAD_AFTER:refs/heads/$BRANCH" || { fail 'Push failed. No PR was created.'; exit 1; }
git -C "$REPO_ROOT" branch --set-upstream-to="$REMOTE/$BRANCH" "$BRANCH" >/dev/null 2>&1 || true

# --- 10. create the pull request -------------------------------------------------------------------------
read -r -d '' VERIFICATION <<EOF || true

---

## Local CI

\`\`\`
Verified commit: $HEAD_AFTER
Result:          PASS
Environment:     Docker (containerised local pipeline, \`scripts/ci.sh\`)
Checks:          environment, no-install-invariant, oracle-readiness, test-suite
\`\`\`

This branch was verified by the repository's containerised local pipeline before it was pushed.
The commit above is the exact commit that passed it — see \`docs/local-ci.md\`.

**This is not a GitHub Actions result.** GitHub-hosted workflows report separately, and nothing
here should be read as a claim about them.
EOF

if ! command -v gh >/dev/null 2>&1; then
  echo; echo 'GitHub CLI (gh) is not installed, so no PR was created.'
  echo "The verified commit is pushed. Open the PR manually against '$BASE'."
  exit 0
fi

if ! gh auth status >/dev/null 2>&1; then
  echo; echo 'GitHub CLI is not authenticated, so no PR was created.'
  echo "Run 'gh auth login', then open the PR against '$BASE'."
  exit 0
fi

# An existing PR is updated by the push that just happened. Creating a second would be wrong, and
# rewriting the first one's body would destroy whatever a human put there.
if EXISTING="$(gh pr view "$BRANCH" --json url --jq .url 2>/dev/null)" && [ -n "$EXISTING" ]; then
  echo
  green 'A pull request already exists and now points at the verified commit:'
  echo "  $EXISTING"
  exit 0
fi

[ -n "$TITLE" ] || TITLE="$SUBJECT"

if   [ -n "$BODY_FILE" ]; then BODY_TEXT="$(cat "$BODY_FILE")"
elif [ -n "$BODY" ];      then BODY_TEXT="$BODY"
else                           BODY_TEXT="$(git -C "$REPO_ROOT" log -1 --pretty=%b)"
fi

TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_BODY"' EXIT
printf '%s\n%s\n' "$BODY_TEXT" "$VERIFICATION" > "$TMP_BODY"

step "Creating the pull request against $BASE"
GH_ARGS=(pr create --base "$BASE" --head "$BRANCH" --title "$TITLE" --body-file "$TMP_BODY")
[ "$DRAFT" -eq 1 ] && GH_ARGS+=(--draft)

gh "${GH_ARGS[@]}" || { fail 'gh pr create failed. The verified commit is pushed; open the PR manually.'; exit 1; }

echo
green "Submitted. Verified commit $HEAD_AFTER"
