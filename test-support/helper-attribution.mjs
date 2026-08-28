/**
 * ST-16, round three. Which NAMES in a file can reach a verdict, without enumerating the ways a
 * function can be written.
 *
 * WHY THIS EXISTS. `assertingHelpers` recognised two declaration forms — `function f() {}` and
 * `const f = () => {}`. That is a list of spellings, and round eleven beat it with six more in one
 * sitting: an object shorthand method, a class method, an arrow inside an array literal, an arrow as
 * a default parameter, a function stored in a `Map`, and a tagged template. None is exotic; each is
 * an ordinary way to keep a check beside the thing it checks.
 *
 * It is the same fault this story has now hit twice. Round two found `consumptions()` enumerating
 * the SINKS a collection could drain into and losing to the next sink. This is that fault one level
 * up: enumerating the SYNTAXES a helper can be declared in, and losing to the next syntax.
 *
 * THE INVERSION. Do not ask how the function was written. Find every function BODY in the file, ask
 * the one question that matters — does it reach a verdict — and attribute the ones that do to the
 * declaration that contains them. The set of function bodies is found by structure (`)` or `=>`
 * followed by a block, or a concise arrow body), so a new way of spelling a function does not need a
 * new rule; it needs no rule.
 *
 * WHY ATTRIBUTION IS BOUNDED. A verdict-reaching body is attributed only to a declaration whose own
 * extent CONTAINS it. Without that bound, `test("x", () => { for (const f of files) assert.ok(f); })`
 * attributes its callback to whatever `const` happened to appear earlier in the file, and every loop
 * mentioning that unrelated name becomes a verdict. Containment is what makes the attribution a fact
 * about the code rather than a fact about proximity.
 */

/** Does this text reach a verdict — an assertion, or a throw? */
const reaches = (text) => /assert\s*[.(]/u.test(text) || /\bthrow\b/u.test(text);

/** The index just past the block opening at `open`, or -1 if it never closes. */
function blockSpan(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    else if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Every function body in the file, as `[start, end)` over `code`.
 *
 * Two shapes cover the language: a block body, which follows either `=>` or the `)` closing a
 * parameter list, and a concise arrow body, which runs to the end of its expression. Getters,
 * setters, methods, constructors, generators and async functions are all the first shape and need no
 * case of their own — which is the point.
 *
 * The `)` form has to exclude control flow: `if (x) {`, `for (...) {`, `while (...) {`, `catch (e) {`
 * and `switch (x) {` all present a block after a parenthesis without being functions, and treating
 * them as function bodies would attribute a loop's own verdict to the enclosing declaration and make
 * every name in the file verdict-reaching.
 */
export function functionBodies(code) {
  const spans = [];
  for (const m of code.matchAll(/=>\s*|\)\s*/gu)) {
    const at = m.index + m[0].length;
    if (code[at] !== "{") continue;
    if (m[0].startsWith(")")) {
      const head = code.slice(0, m.index);
      const open = head.lastIndexOf("(");
      if (open === -1) continue;
      const before = head.slice(0, open).replace(/\s+$/u, "");
      if (/\b(?:if|for|while|switch|catch|with)$/u.test(before)) continue;
    }
    const end = blockSpan(code, at);
    if (end !== -1) spans.push([at, end]);
  }
  // Concise arrow bodies: `(f) => assert.ok(f)`. No block, so the body is the expression that
  // follows, and it ends where the enclosing expression does.
  for (const m of code.matchAll(/=>\s*(?!\{)/gu)) {
    const start = m.index + m[0].length;
    let depth = 0;
    let i = start;
    for (; i < code.length; i += 1) {
      const c = code[i];
      if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth -= 1;
      } else if (depth === 0 && (c === ";" || c === "," || c === "\n")) break;
    }
    spans.push([start, i]);
  }
  return spans;
}

/**
 * Every declaration in the file, as `{ name, start, end }` covering its whole extent.
 *
 * The extent of `const X = <init>` runs to the `;` or line end that closes the initialiser at depth
 * zero, so a multi-line object, array or arrow is covered entirely. For `function` and `class` it is
 * the brace block. Both are needed: a helper may be a property of an object literal several lines
 * below the `const` that names it.
 */
export function declarations(code) {
  const out = [];
  for (const m of code.matchAll(/(?:^|[;{}\n)])\s*(?:export\s+)?(const|let|var|function|class)\s*\*?\s*([A-Za-z_$][\w$]*)/gu)) {
    const kind = m[1];
    const name = m[2];
    const from = m.index + m[0].length;
    if (kind === "function" || kind === "class") {
      const open = code.indexOf("{", from);
      const end = open === -1 ? -1 : blockSpan(code, open);
      if (end !== -1) out.push({ name, start: from, end });
      continue;
    }
    let depth = 0;
    let i = from;
    for (; i < code.length; i += 1) {
      const c = code[i];
      if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth -= 1;
      } else if (depth === 0 && c === ";") break;
    }
    out.push({ name, start: from, end: i });
  }

  // A name may also bind a function without a declaration keyword: an object property
  // (`{ check: (f) => ... }`), a default parameter (`(xs, fn = (f) => ...)`), a class field, or a
  // plain assignment. Attribution needs these because the INNERMOST containing binder is the one a
  // caller names — round eleven's default-parameter shape was attributed to the enclosing `const`
  // and so was never reachable by the name the loop actually called.
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*[:=](?![=>])\s*/gu)) {
    const before = code.slice(0, m.index).replace(/\s+$/u, "").slice(-1);
    if (/[\w$.]/u.test(before)) continue;
    const from = m.index + m[0].length;
    let depth = 0;
    let i = from;
    for (; i < code.length; i += 1) {
      const c = code[i];
      if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth -= 1;
      } else if (depth === 0 && (c === ";" || c === ",")) break;
    }
    out.push({ name: m[1], start: from, end: i });
  }
  return out;
}

/**
 * Names in this file that can reach a verdict, however the function behind them is written.
 *
 * A name qualifies when a verdict-reaching function body lies inside its declaration's extent. The
 * INNERMOST containing declaration wins, so a helper defined inside another helper is attributed to
 * itself rather than to its host, and calling the host is not thereby a verdict.
 */
export function verdictBearingNames(code) {
  const decls = declarations(code);
  const names = new Set();
  for (const [start, end] of functionBodies(code)) {
    if (!reaches(code.slice(start, end))) continue;
    const containing = decls
      .filter((d) => d.start <= start && d.end >= end)
      .sort((a, b) => (b.end - b.start) - (a.end - a.start))
      .pop();
    if (containing) names.add(containing.name);
  }

  // One transitive hop, and only through CONSTRUCTION. `class V { check(f) { assert.ok(f); } }`
  // attributes to `V`, but the loop calls `v.check(f)` on `const v = new V()`, and without this the
  // instance is a different name from the class and the verdict is lost between them.
  //
  // Mentioning a verdict-bearing name is deliberately NOT enough. `const rows = statesTable()` binds
  // DATA: the assertions inside `statesTable` already ran, at that line, and a later loop over
  // `rows` is not thereby a verdict. Written as a plain mention, this hop flagged an honest guard in
  // `front-door.test.mjs` whose parse loop asserts nothing — a false positive on the real surface,
  // which is the failure that makes a discriminator worse than none. Construction is the narrow case
  // the hop was for, so construction is all it does.
  for (let changed = true; changed; ) {
    changed = false;
    for (const d of decls) {
      if (names.has(d.name)) continue;
      const init = code.slice(d.start, d.end);
      for (const n of names) {
        if (new RegExp("\\bnew\\s+" + n + "\\s*\\(", "u").test(init)) {
          names.add(d.name);
          changed = true;
          break;
        }
      }
    }
    // Iterating a collection of checks binds each check to the loop variable, so the variable
    // carries the verdict: `const checks = [(f) => assert.ok(f)]` attributes to `checks`, and
    // `for (const c of checks) c(f)` reaches the verdict through `c`. Without this the collection is
    // named but never called, and the mention rule — which looks for a call, a member access or a
    // tag — correctly does not fire on `of checks)`.
    for (const m of code.matchAll(/for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s+of\s+([A-Za-z_$][\w$]*)/gu)) {
      if (names.has(m[2]) && !names.has(m[1])) {
        names.add(m[1]);
        changed = true;
      }
    }
  }
  return names;
}

/**
 * Every place `assert` is used as a VALUE rather than as the receiver of a call.
 *
 * The premise is that verdicts are reached by calling `assert.something(...)` or `assert(...)`. The
 * moment `assert` is passed somewhere — `run(assert, files)`, `new Proxy(assert, {})`,
 * `assert.ok.bind(assert)` — the verdict can be reached through a name this file never mentions, and
 * every rule that matches the identifier `assert` stops seeing it.
 *
 * Stated as an inversion rather than a list: `assert` may appear as a callee and nowhere else.
 * `const eq = assert.equal` was the enumerated form of this and caught two of round eleven's twenty
 * shapes; this catches those two and the argument-position shapes as well, without naming any of
 * them.
 */
export function assertEscapes(code) {
  const out = [];
  for (const m of code.matchAll(/\bassert\b/gu)) {
    const after = code.slice(m.index + "assert".length);
    // A callee: `assert(` or `assert.method(` with nothing but the member path in between.
    if (/^\s*\(/u.test(after)) continue;
    if (/^\s*\.\s*[A-Za-z_$][\w$]*\s*\(/u.test(after)) continue;
    // The import that binds it is not a use of it.
    const line = code.slice(code.lastIndexOf("\n", m.index) + 1, code.indexOf("\n", m.index));
    if (/^\s*import\b/u.test(line)) continue;
    out.push(line.trim());
  }
  return out;
}
