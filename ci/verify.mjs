/**
 * The submission gate: does this evidence authorise pushing *this* commit?
 *
 * WHY THIS IS A MODULE AND NOT FOUR LINES OF SHELL. The invariant this repository is adding is:
 *
 *     A pull request may only be submitted if the exact commit SHA being pushed has passed the
 *     complete containerised CI pipeline.
 *
 * That is a claim about identity, and this repository already knows what happens to identity
 * claims that live in scripts nothing tests: they get one comparison subtly wrong — an
 * abbreviated SHA, a case difference, a stale file read as fresh — and the failure mode is a
 * green light rather than a red one. So the decision lives here, in one place, in the language
 * the test suite is written in, and `test/local-ci-verify.test.mjs` exercises it directly
 * including the mismatch case. `scripts/submit-pr.*` do not re-implement it; they call it.
 *
 * It is invoked inside the CI image that the run just built, so that enforcing the invariant
 * needs no Node on the developer's machine — the same reason the pipeline itself is containerised.
 *
 *     node ci/verify.mjs --evidence=/evidence/latest.json --head=<40-hex> --branch=<name>
 *
 * Exit 0 authorises the push. Any other exit code forbids it. There is no third outcome, and in
 * particular there is no "could not tell" that resolves to yes: an unreadable, absent or
 * unparseable result is a refusal, because INV-E1 says an unknown enforcement condition is never
 * converted into a successful one.
 */

import { readFileSync } from "node:fs";
import process from "node:process";

/** A full commit identity is 40 hex characters. An abbreviation is not an identity. */
const FULL_SHA = /^[0-9a-f]{40}$/;

export const OUTCOME = {
  OK: "OK",
  NO_EVIDENCE: "NO_EVIDENCE",
  UNREADABLE: "UNREADABLE",
  NOT_PASSED: "NOT_PASSED",
  NOT_A_COMMIT: "NOT_A_COMMIT",
  SHA_MISMATCH: "SHA_MISMATCH",
  BRANCH_MISMATCH: "BRANCH_MISMATCH",
  MALFORMED_HEAD: "MALFORMED_HEAD",
};

/**
 * Decide whether a push is authorised.
 *
 * Pure: takes the evidence as already-read text so the test can hand it any shape at all,
 * including shapes the CI script could not produce today but a future edit might.
 *
 * @param {object}  input
 * @param {string|null} input.evidenceText  contents of artifacts/local-ci/latest.json, or null
 * @param {string}  input.head              the SHA that would actually be pushed
 * @param {string}  input.branch            the branch that would actually be pushed
 * @returns {{ok: boolean, outcome: string, message: string}}
 */
export function decideSubmission({ evidenceText, head, branch }) {
  const no = (outcome, message) => ({ ok: false, outcome, message });

  if (typeof head !== "string" || !FULL_SHA.test(head)) {
    return no(
      OUTCOME.MALFORMED_HEAD,
      `Refusing to submit: "${head}" is not a full 40-character commit SHA, so there is nothing ` +
        `to compare the verification against.`,
    );
  }

  if (evidenceText === null || evidenceText === undefined || String(evidenceText).trim() === "") {
    return no(
      OUTCOME.NO_EVIDENCE,
      "Refusing to submit: no local CI result was found. Nothing has been verified.\n" +
        "Run the pipeline first: scripts/ci.ps1 (or scripts/ci.sh).",
    );
  }

  let evidence;
  try {
    evidence = JSON.parse(String(evidenceText));
  } catch (error) {
    return no(
      OUTCOME.UNREADABLE,
      `Refusing to submit: the local CI result could not be parsed (${error.message}). ` +
        `An unreadable result is not a passing one.`,
    );
  }

  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
    return no(OUTCOME.UNREADABLE, "Refusing to submit: the local CI result is not an object.");
  }

  if (evidence.result !== "passed") {
    return no(
      OUTCOME.NOT_PASSED,
      `Refusing to submit: the last local CI run recorded result "${evidence.result ?? "(absent)"}"` +
        `${evidence.failedCheck ? ` (failed check: ${evidence.failedCheck})` : ""}.\n` +
        "CI failed. No branch was pushed and no PR was created.",
    );
  }

  // A run against uncommitted files proves something about a working tree, and a working tree is
  // not what gets pushed. It is a legitimate mode for iterating; it is not a licence to submit.
  if (evidence.source !== "commit") {
    return no(
      OUTCOME.NOT_A_COMMIT,
      `Refusing to submit: the last local CI run verified source "${evidence.source ?? "(absent)"}", ` +
        `not a commit.\nA working-tree run does not verify the commit that would be pushed. ` +
        `Commit your changes and run CI again without --working-tree.`,
    );
  }

  if (typeof evidence.commit !== "string" || !FULL_SHA.test(evidence.commit)) {
    return no(
      OUTCOME.UNREADABLE,
      `Refusing to submit: the local CI result records commit "${evidence.commit ?? "(absent)"}", ` +
        `which is not a full 40-character SHA.`,
    );
  }

  // THE INVARIANT. Everything above is about being able to trust the comparison; this is the
  // comparison. Full SHA against full SHA, no abbreviation, no prefix matching.
  if (evidence.commit !== head) {
    return no(
      OUTCOME.SHA_MISMATCH,
      "HEAD changed after CI verification. The current commit has not been verified. " +
        "Re-run CI before submitting.\n" +
        `  verified: ${evidence.commit}\n` +
        `  current:  ${head}\n` +
        "No branch was pushed and no PR was created.",
    );
  }

  // Branch is checked second and separately. A matching SHA on a different branch name is not the
  // invariant being violated, but it does mean the evidence describes a different submission than
  // the one being attempted, and silently accepting it would make the record wrong.
  if (typeof branch === "string" && branch !== "" && typeof evidence.branch === "string" && evidence.branch !== branch) {
    return no(
      OUTCOME.BRANCH_MISMATCH,
      `Refusing to submit: the local CI result was recorded on branch "${evidence.branch}", ` +
        `but "${branch}" would be pushed.\nRe-run CI on this branch before submitting.`,
    );
  }

  return {
    ok: true,
    outcome: OUTCOME.OK,
    message: `Verified commit ${evidence.commit} on ${evidence.branch ?? branch} — local Docker CI PASS.`,
  };
}

/** Read a file, or null when it is not there. Any other error is a real error and propagates. */
function readOrNull(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function argOf(name) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? "" : hit.slice(name.length + 3);
}

// Executed directly, rather than imported by the test.
if (process.argv[1] && process.argv[1].endsWith("verify.mjs")) {
  const decision = decideSubmission({
    evidenceText: readOrNull(argOf("evidence") || "/evidence/latest.json"),
    head: argOf("head"),
    branch: argOf("branch"),
  });

  process.stdout.write(decision.message + "\n");
  process.exit(decision.ok ? 0 : 1);
}
