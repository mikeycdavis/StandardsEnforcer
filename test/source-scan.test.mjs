/**
 * The source scanner, tested as the load-bearing thing it now is.
 *
 * `test-support/source-scan.mjs` sits between a structural guard and its subject. If it is wrong in
 * the quiet direction — removing code, or leaving prose behind — a guard downstream reports a pass
 * it did not earn, which is precisely the defect that produced this file. So its two failure modes
 * are asserted here directly rather than being trusted at the call site, and the reproduction of the
 * original CRLF defect is kept as a case so a future refactor cannot reintroduce it unnoticed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { readSource, stripComments } from "../test-support/source-scan.mjs";

// --- readSource: the defect it exists to remove --------------------------------------------------

test("scan · THE ORIGINAL DEFECT: a CRLF source defeats an LF slice, and reports nothing", async () => {
  // The exact shape PR #2's guard had. Not a hypothetical: this returned -1 in every environment
  // this repository has ever run in, container CI included, because `.mjs` has no `text eol=lf`
  // attribute and the CI image is built from a `git archive` of a CRLF checkout.
  const crlf = "export function f() {\r\n  const POLICY_FILE = 1;\r\n}\r\n";

  assert.equal(crlf.indexOf("\n}\n"), -1, "the LF delimiter is simply absent from CRLF text");
  const asShipped = crlf.slice(0, crlf.indexOf("\n}\n") + 1);
  assert.equal(asShipped, "", "so the body was empty");
  assert.equal(asShipped.includes("POLICY_FILE"), false,
    "and the guard's assertion held vacuously — this is the false green, reproduced");

  // Normalised, the same delimiter is found and the same assertion now has something to fail on.
  const normalised = crlf.replace(/\r\n/gu, "\n");
  assert.ok(normalised.indexOf("\n}\n") > 0);
  assert.equal(normalised.slice(0, normalised.indexOf("\n}\n") + 1).includes("POLICY_FILE"), true);
});

test("scan · readSource returns LF regardless of what is on disk", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "source-scan-"));
  try {
    const file = path.join(dir, "crlf.mjs");
    await writeFile(file, "const a = 1;\r\nconst b = 2;\r\n");
    const text = await readSource(new URL(`file://${file.replace(/\\/gu, "/")}`));
    assert.equal(text.includes("\r"), false, "no carriage return survives");
    assert.equal(text, "const a = 1;\nconst b = 2;\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- stripComments: both directions it could be wrong in ------------------------------------------

test("scan · comments go, code stays", () => {
  const out = stripComments(
    "const a = 1; // POLICY_FILE in a line comment\n/* POLICY_FILE in a block */\nconst b = 2;\n",
  );
  assert.equal(out.includes("POLICY_FILE"), false, "prose is gone");
  assert.equal(out.includes("const a = 1;"), true, "and code is not");
  assert.equal(out.includes("const b = 2;"), true);
});

test("scan · line numbers survive, so a downstream failure stays locatable", () => {
  const src = "a\n// comment\n/* two\n   lines */\nb\n";
  const out = stripComments(src);
  assert.equal(out.split("\n").length, src.split("\n").length);
});

test("scan · a comment marker inside a string is not a comment", () => {
  // The case that rules out the regex form of this function. A path or a URL in a string literal
  // would otherwise swallow the rest of the line, silently deleting real code from the scan.
  const out = stripComments('const u = "https://example.test/x"; const k = POLICY_FILE;\n');
  assert.equal(out.includes("POLICY_FILE"), true, "code after a // inside a string must survive");
  assert.equal(out.includes("https://example.test/x"), true);
});

test("scan · a comment marker inside a template or a regex is not a comment either", () => {
  const template = stripComments("const t = `a // b`; const k = POLICY_FILE;\n");
  assert.equal(template.includes("POLICY_FILE"), true);

  const regex = stripComments("const r = /a\\/\\/b/u; const k = POLICY_FILE;\n");
  assert.equal(regex.includes("POLICY_FILE"), true);
});

test("scan · division is not mistaken for a regex literal", () => {
  // `x / y` after a value divides. Reading it as an opening regex delimiter would swallow everything
  // to the next `/` — a whole-region deletion that a downstream guard would report as a pass.
  const out = stripComments("const q = total / count; const k = POLICY_FILE;\n");
  assert.equal(out.includes("POLICY_FILE"), true);
  assert.equal(out.includes("total / count"), true);
});

test("scan · an escaped quote does not end a string early", () => {
  const out = stripComments('const s = "he said \\"// not a comment\\""; const k = POLICY_FILE;\n');
  assert.equal(out.includes("POLICY_FILE"), true);
});

test("scan · stripping replaces rather than deletes, so nothing is joined into a new token", () => {
  // `AB` must not appear where `A /*…*/ B` was written. A collapsing stripper could manufacture an
  // identifier that no author wrote, and a guard scanning for one would then find it.
  const src = "A/* joined */B\n";
  const out = stripComments(src);
  assert.equal(out.includes("AB"), false);
  assert.equal(out.length, src.length, "the gap is preserved at its original width");
  assert.match(out, /^A {12}B\n$/u);
});

test("scan · the scanner does not corrupt this repository's own source", async () => {
  // The end-to-end property the guards depend on: over real source, code the guards look for is
  // still present after stripping. A stripper that ate the seam would make every structural
  // assertion downstream vacuous in exactly the way this file exists to prevent.
  const src = await readSource(new URL("../scripts/enforce.mjs", import.meta.url));
  const out = stripComments(src);

  assert.equal(out.length, src.length, "replacement preserves length, so offsets stay comparable");
  for (const token of ["export function runOfficialEvaluator", "bindArguments", "const POLICY_FILE"]) {
    assert.ok(out.includes(token), `stripping removed real code: ${token}`);
  }
  assert.equal(out.includes("Deriving"), false, "and prose from the seam's comments is gone");
});
