/**
 * The checkout line-ending invariant.
 *
 * THE GUARANTEE:
 *
 *     Every tracked file's line-ending behaviour is DECLARED by this repository, and what lands on
 *     disk is what was declared. No file's bytes are decided by the machine that happened to clone
 *     it.
 *
 * WHY THIS IS NOT A STYLE TEST. `test/adapter-policy-binding.test.mjs` once extracted a function
 * body with `indexOf("\n}\n")`. On a CRLF checkout that returns -1, the extracted body is `""`, and
 * the guard scanned an empty string and reported success — a vacuous green over nothing. The repair
 * there taught one consumer to read LF regardless of disk. That fixed a consumer; it did not fix the
 * condition. Any later test comparing committed text against generated text can acquire the same
 * fault, and it presents as a Windows-only failure that a Linux run reports green.
 *
 * TWO ENVIRONMENTS, TWO INSTRUMENTS, AND WHY.
 *
 * The containerised pipeline runs against a tree with no `.git` at all: `scripts/ci.sh` produces it
 * with `git archive` and `ci/Dockerfile` copies it to /work, precisely so nothing on a developer's
 * disk can change what runs. So `git ls-files --eol` — the instrument that can see the *declaration*
 * — is unavailable exactly where CI runs.
 *
 *     with .git       declared?      ──▶  git ls-files --eol reads the attribute   (the root cause)
 *     without .git    materialised?  ──▶  read the bytes off disk                  (the corruption)
 *
 * Neither branch may pass by default. Where the repository is present, the declaration is checked.
 * Where it is not, the bytes are still checked, so a CRLF blob that ever reached a commit would
 * arrive in the archive and fail here. A skipped assertion is reported as skipped and is never a
 * pass — INV-E1 applies to this suite's own results too.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Whether the git metadata this repository's declaration lives in is readable from here. */
function repositoryIsReadable() {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], { cwd: REPO, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * One row of `git ls-files --eol`, which is column formatted:
 *
 *     i/lf    w/crlf  attr/text=auto eol=lf   <TAB>path/to/file
 *
 * The attribute field can contain spaces, so the tab before the path is the only safe split point.
 */
function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "--eol"], { cwd: REPO, encoding: "utf8" });
  return out
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const tab = line.indexOf("\t");
      const fields = line.slice(0, tab).trim().split(/\s+/u);
      return {
        index: fields[0].replace(/^i\//u, ""),
        worktree: fields[1].replace(/^w\//u, ""),
        attr: fields.slice(2).join(" ").replace(/^attr\//u, "").trim(),
        file: line.slice(tab + 1).trim(),
      };
    });
}

/**
 * What this repository has declared for a file. `-text` disables translation entirely, which is a
 * declaration in its own right — it is how the verbatim governance fixtures keep the byte-for-byte
 * claim `test/fixtures/governance/PROVENANCE.md` makes about them.
 */
function declaredEol(attr) {
  if (attr === "") return "undeclared";
  if (/(^|\s)-text(\s|$)/u.test(attr)) return "untranslated";
  if (/eol=crlf/u.test(attr)) return "crlf";
  if (/eol=lf/u.test(attr)) return "lf";
  if (/(^|\s)text(=auto)?(\s|$)/u.test(attr)) return "lf";
  return "undeclared";
}

/**
 * The surfaces `.gitattributes` exempts from LF, restated here because the byte-level check runs
 * where git cannot resolve `.gitattributes` for us. Kept as exact suffixes and path prefixes rather
 * than a general matcher: this list is meant to be read against that file, not to reimplement it.
 */
const NOT_LF_BY_DECLARATION = [
  { kind: "suffix", value: ".ps1" }, // text eol=crlf — deliberate platform convention
  { kind: "suffix", value: ".svg" }, // -text — generated renders, diffed as binary
  { kind: "prefix", value: "test/fixtures/governance/" }, // -text — verbatim external evidence
];

/** Directories that are not part of the checkout's declared content. */
const NOT_CONTENT = new Set([".git", "node_modules"]);

function walk(dir, rel = "") {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (NOT_CONTENT.has(entry.name)) continue;
    const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      // Written by the pipeline, not established by the commit under test.
      if (relPath === "artifacts/local-ci") continue;
      found.push(...walk(path.join(dir, entry.name), relPath));
    } else if (entry.isFile()) {
      found.push(relPath);
    }
  }
  return found;
}

function exemptFromLf(relPath) {
  return NOT_LF_BY_DECLARATION.some((rule) =>
    rule.kind === "suffix" ? relPath.endsWith(rule.value) : relPath.startsWith(rule.value),
  );
}

/** A NUL byte is the same heuristic git uses to decide a file is not text. */
function looksBinary(buf) {
  return buf.includes(0);
}

test("line endings · every tracked file's translation is declared, not left to the machine", (t) => {
  if (!repositoryIsReadable()) {
    t.skip(
      "no git metadata here — this tree came from `git archive` for the container, so the " +
        "declaration cannot be read. The byte-level check still runs.",
    );
    return;
  }

  const undeclared = trackedFiles().filter((f) => declaredEol(f.attr) === "undeclared");

  assert.deepEqual(
    undeclared.map((f) => f.file),
    [],
    `${undeclared.length} tracked file(s) have no line-ending attribute, so what lands on disk is ` +
      `decided by each machine's core.autocrlf rather than by this repository. A checkout is not ` +
      `reproducible while that is true.`,
  );
});

test("line endings · the working tree materialises what was declared", (t) => {
  if (!repositoryIsReadable()) {
    t.skip("no git metadata here — see the note on the previous test.");
    return;
  }

  const wrong = trackedFiles().filter((f) => {
    const declared = declaredEol(f.attr);
    if (declared === "undeclared" || declared === "untranslated") return false;
    // `none` means the file contains no line terminator at all — nothing was translated.
    if (f.worktree === "none") return false;
    return f.worktree !== declared;
  });

  assert.deepEqual(
    wrong.map((f) => `${f.file} (declared ${declaredEol(f.attr)}, on disk ${f.worktree})`),
    [],
    "a declared line ending that the checkout does not honour is a declaration in name only",
  );
});

test("line endings · no committed blob carries CRLF", (t) => {
  if (!repositoryIsReadable()) {
    t.skip("no git metadata here — the byte-level check covers the archived content.");
    return;
  }

  // If a CRLF blob were committed, `eol=lf` would still yield an LF working tree and the assertions
  // above would pass while the history itself held the corruption.
  const stored = trackedFiles().filter((f) => f.index === "crlf");
  assert.deepEqual(stored.map((f) => f.file), [], "committed blobs must be LF");
});

test("line endings · nothing on disk carries CRLF except where this repository declares it", () => {
  // The one assertion needing no git metadata, so it is the one that runs inside the container. It
  // reads the bytes — the only thing available there, and the only thing that matters to a consumer
  // that opens the file.
  const offenders = [];
  for (const rel of walk(REPO)) {
    if (exemptFromLf(rel)) continue;
    let buf;
    try {
      buf = fs.readFileSync(path.join(REPO, rel));
    } catch {
      continue; // vanished mid-walk; not this test's subject
    }
    if (looksBinary(buf)) continue;
    if (buf.includes("\r\n")) offenders.push(rel);
  }

  assert.deepEqual(
    offenders.slice(0, 40),
    [],
    `${offenders.length} file(s) contain CRLF on disk without this repository declaring it. ` +
      `Adding the declaration does not rewrite a checkout that already exists: refresh it with ` +
      `\`git rm --cached -r . && git reset --hard\` after the attributes land.`,
  );
});
