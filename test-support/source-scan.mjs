/**
 * Reading this repository's own source as text, without the two ways that quietly stops working.
 *
 * WHY THIS EXISTS. Several tests here assert structural properties by reading a `.mjs` file and
 * looking at what is in it — ADR 0001's "no domain vocabulary in scripts/" guard is the oldest, and
 * PR #2's "no policy filename in the evaluator seam" is the newest. A scan like that has two failure
 * modes that do not look like failures:
 *
 *   1. THE EXTRACTION SILENTLY MATCHES NOTHING, and the assertions run against an empty string.
 *      This is not hypothetical. PR #2's guard sliced on the literal "\n}\n"; `core.autocrlf=true`
 *      on the authoring machine, and `.mjs` carries no `text eol=lf` attribute, so the working tree
 *      and the `git archive` the CI image is built from both carry CRLF. `indexOf` returned -1,
 *      `slice(0, 0)` returned "", and both assertions passed against nothing — in every environment,
 *      authoritative container CI included. It was green from the day it was merged and had never
 *      executed. Measured against an archived `main`: `body.length` 0.
 *
 *   2. THE SCAN CANNOT TELL CODE FROM PROSE ABOUT CODE. A guard forbidding an identifier trips on
 *      the comment explaining why the identifier is forbidden. The usual repair — reword the comment
 *      — leaves the guard just as blunt and adds a rule nobody can see: do not say this word here.
 *
 * `readSource` answers the first by normalising, and every caller asserting its own liveness answers
 * the rest of it. `stripComments` answers the second by making the subject the mechanism.
 *
 * THIS IS NOT A CLAIM ABOUT THE OTHER SCANNERS. Whether any other source-reading test in this suite
 * shares either defect is an open question with an item of its own; it has not been audited here,
 * and adopting this helper elsewhere is that item's work, not this file's.
 */

import { readFile } from "node:fs/promises";

/**
 * The text of a source file, with line endings normalised to LF.
 *
 * Normalised rather than pinned in `.gitattributes`, deliberately. The bytes CI executes may differ
 * from the committed blob, and that is true of every `.mjs` here; a scanner that breaks on it is a
 * defective scanner, not evidence that the repository needs whole-tree normalisation. Node does not
 * care either way. See the line-ending item.
 */
export async function readSource(url) {
  return (await readFile(url, "utf8")).replace(/\r\n/gu, "\n");
}

/**
 * `source` with comments replaced by spaces, so a structural scan sees code and not commentary.
 *
 * Spaces rather than deletion, so nothing that was apart is accidentally joined into a token that
 * was never written. A small state machine rather than a regex, because the regex form has to decide
 * whether a `//` inside a string literal opens a comment, and gets it wrong: this file's own
 * `"\n}\n"` and every path in the suite are the counterexamples. Handles line comments, block
 * comments, the three string forms, and regex literals — enough for this repository's source, and
 * callers assert that stripping left their code intact rather than trusting it blindly.
 */
export function stripComments(source, { strings = false } = {}) {
  // `strings: true` also blanks string and regex BODIES, keeping their delimiters. A scan whose
  // subject is other tests needs it: a specimen like "assert.ok(xs.length > 0)" held as data would
  // otherwise satisfy a rule about what the file asserts. Default false, so every existing caller
  // is unaffected.
  const out = [];
  let i = 0;
  // What we are currently inside of. `code` is the only state that can open a comment.
  let state = "code";
  let quote = "";
  // A template interpolation is CODE, not string content, so `${...}` is left intact while the
  // literal text around it is blanked. Before this, `assert.equal(`${xs.filter(p)}`, "")` scanned to
  // `assert.equal(`      `, "")` — the verdict, its subject and its consumption all invisible to
  // every scanner in this repository. The stack holds the brace depth at which each interpolation
  // began, so a `}` closing an object inside the interpolation does not end it early.
  const interpolations = [];
  let braces = 0;
  // The last significant code character, which is how a `/` is told apart: after a value it divides,
  // after an operator or a `(` it opens a regex literal.
  let prev = "";
  // Whether the regex literal being scanned is currently inside a `[...]` character class.
  let escapedClass = false;

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    if (state === "code") {
      if (c === "/" && next === "/") { state = "line"; out.push("  "); i += 2; continue; }
      if (c === "/" && next === "*") { state = "block"; out.push("  "); i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") { state = "string"; quote = c; out.push(c); i += 1; continue; }
      if (c === "/" && prev !== "" && !/[\w$)\]]/u.test(prev)) { state = "regex"; escapedClass = false; out.push(c); i += 1; continue; }
      if (c === "{") braces += 1;
      else if (c === "}") {
        if (interpolations.length > 0 && braces === interpolations[interpolations.length - 1]) {
          interpolations.pop();
          state = "string";
          quote = "`";
          out.push(c);
          i += 1;
          continue;
        }
        braces -= 1;
      }
      out.push(c);
      if (!/\s/u.test(c)) prev = c;
      i += 1;
      continue;
    }

    if (state === "line") {
      // The newline is kept so line numbers survive, which is what makes a failure locatable.
      if (c === "\n") { state = "code"; out.push(c); i += 1; continue; }
      out.push(" ");
      i += 1;
      continue;
    }

    if (state === "block") {
      if (c === "*" && next === "/") { state = "code"; out.push("  "); i += 2; continue; }
      out.push(c === "\n" ? "\n" : " ");
      i += 1;
      continue;
    }

    // string or regex: only the terminator matters, and a backslash defers it by one.
    if (state === "string" && quote === "`" && c === "$" && next === "{") {
      interpolations.push(braces);
      state = "code";
      prev = "{";
      out.push("${");
      i += 2;
      continue;
    }
    if (c === "\\") { out.push(strings ? "  " : c + (next ?? "")); i += 2; continue; }
    // A `/` inside a regex CHARACTER CLASS does not end the literal. Without this,
    // `/^[a-z]+:\/\/([^/@]+)@/i` ended at the `/` in `[^/@]`, the `@]+)@` that followed was read as
    // code, and the `/` before `i` opened a second regex that blanked live source until the next
    // slash. One real module lost its remaining exports that way, and every scanner in this
    // repository — ST-15's and ST-16's included — was blind to them.
    if (state === "regex" && !escapedClass && c === "[") escapedClass = true;
    else if (state === "regex" && escapedClass && c === "]") escapedClass = false;
    if ((state === "string" && c === quote) || (state === "regex" && c === "/" && !escapedClass)) {
      state = "code";
      prev = c === "/" ? ")" : c;
      out.push(c);
      i += 1;
      continue;
    }
    // Newlines are kept even when blanking, so line numbers survive here too.
    out.push(strings && c !== "\n" ? " " : c);
    i += 1;
  }

  return out.join("");
}
