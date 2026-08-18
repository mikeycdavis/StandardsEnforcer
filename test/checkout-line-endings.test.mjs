/**
 * The checkout line-ending invariant.
 *
 * THE GUARANTEE:
 *
 *     Every tracked file's line-ending behaviour is DECLARED by this repository, and the working
 *     tree materialises what was declared. No tracked file's bytes are decided by the machine that
 *     happened to clone it.
 *
 * WHY THIS IS NOT A STYLE TEST. `test/adapter-policy-binding.test.mjs` once extracted a function
 * body with `indexOf("\n}\n")`. On a CRLF checkout that returns -1, the extracted body is `""`, and
 * the guard then scanned an empty string and reported success — a vacuous green over nothing. The
 * repair there taught one consumer to read LF regardless of disk. That fixed a consumer; it did not
 * fix the condition. Any future test comparing committed text against generated text can acquire the
 * same fault, and it presents as a Windows-only failure that a Linux run reports green.
 *
 * WHY THE FIRST ASSERTION IS THE PRIMARY ONE. The obvious test — "no working-tree file contains
 * CRLF" — is red on a Windows checkout and GREEN INSIDE THE CI CONTAINER, because the container
 * clones on Linux where the translation never happens. A test that cannot fail where CI runs is not
 * protection; it is the same Windows-only blind spot one level up. So the load-bearing assertion is
 * the machine-independent one: attributes come from `.gitattributes`, so an undeclared file reads as
 * undeclared everywhere, container included.
 *
 *     declared?   ──no──▶  core.autocrlf decides    ← the defect, visible on every platform
 *         │
 *        yes
 *         │
 *         ▼
 *     materialised as declared?                     ← the corruption itself, visible where it happens
 *
 * `git ls-files --eol` is the instrument for both. It reports, per tracked file, the line ending in
 * the index (`i/`), the line ending in the working tree (`w/`), and the resolved attributes
 * (`attr/`) — which is exactly the declared-versus-actual pair this invariant is about.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * One row of `git ls-files --eol`, which is whitespace-column formatted:
 *
 *     i/lf    w/crlf  attr/text=auto eol=lf   	path/to/file
 *
 * The path is separated from the attributes by a tab, and the attribute field may itself contain
 * spaces, so the tab is the only safe split point.
 */
function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "--eol"], { cwd: REPO, encoding: "utf8" });
  return out
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const tab = line.indexOf("\t");
      const fields = line.slice(0, tab).trim().split(/\s+/);
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

test("line endings · every tracked file's translation is declared, not left to the machine", () => {
  const undeclared = trackedFiles().filter((f) => declaredEol(f.attr) === "undeclared");

  assert.deepEqual(
    undeclared.map((f) => f.file),
    [],
    `${undeclared.length} tracked file(s) have no line-ending attribute, so what lands on disk is ` +
      `decided by each machine's core.autocrlf rather than by this repository. A checkout is not ` +
      `reproducible while that is true.`,
  );
});

test("line endings · the working tree materialises what was declared", () => {
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

test("line endings · no committed blob carries CRLF, so the declaration is the only thing translating", () => {
  // If a CRLF blob were committed, `eol=lf` would still produce an LF working tree and the two
  // assertions above would pass while the repository's own history held the corruption. This keeps
  // the invariant a statement about stored bytes as well as materialised ones.
  const stored = trackedFiles().filter((f) => f.index === "crlf");

  assert.deepEqual(stored.map((f) => f.file), [], "committed blobs must be LF");
});
