# Which environment is executing this pipeline?
#
# THE INVARIANT THIS EXISTS TO HOLD:
#
#     The result artifact must describe the environment that actually executed it. Callers and
#     wrappers must not overwrite provenance after the fact.
#
# WHY IT IS A FILE OF ITS OWN. `ci/checks.sh` is the single authoritative check list and is run by
# BOTH the local Docker pipeline and the GitHub Actions workflow. It used to print, unconditionally:
#
#     Environment:     Docker (local). This is NOT a GitHub Actions result.
#
# and to write `"environment": "docker"` into the machine-readable result. On a hosted runner both
# were false, so a GitHub Actions result denied being one — in its own summary and in the artifact a
# consumer would read. That is the same defect class as a manifest asserting a version its policy
# does not declare: an artifact making a false statement about itself.
#
# WHY `GITHUB_ACTIONS` IS THE EVIDENCE. It is set to the literal `true` by the runner itself, before
# any step of ours executes, so it is a property of the executing environment rather than something
# this pipeline or its callers assert about themselves. Deliberately NOT `CI`, which almost every
# provider sets, and deliberately not an argument passed in by the caller — a caller-supplied flag
# would be exactly the after-the-fact overwrite the invariant forbids.
#
# The negative case is not "not Actions", it is Docker local CI, which is the only other way this
# check list is ever run. If a third executor is added, it must identify itself here and not be
# allowed to inherit a default that names somewhere it did not run.

ci_environment_id() {
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    printf 'github-actions'
  else
    printf 'docker'
  fi
}

ci_environment_label() {
  if [ "$(ci_environment_id)" = "github-actions" ]; then
    printf 'GitHub Actions (hosted runner)'
  else
    # The caveat is kept, because on a local run it is true and load-bearing: this repository
    # requires a containerised pass before a push, and that pass must never be mistaken for hosted
    # verification.
    printf 'Docker local CI. This is NOT a GitHub Actions result.'
  fi
}
