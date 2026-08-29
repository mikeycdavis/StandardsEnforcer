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
  // `(?:\?\?|\|\||&&)?=` so a LOGICAL ASSIGNMENT binds too. `chk ??= (f) => assert.ok(f)` declares
  // nothing and initialises nothing, so neither the keyword scan above nor a plain `=` binder saw it,
  // and the function body it holds had no name to be attributed to at all.
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*(?:\?\?|\|\||&&)?=(?![=>])\s*/gu)) {
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

  // A MEMBER PATH is also a binding: `o.c = chk` puts a checker somewhere a loop can call it as
  // `o.c(f)`. The scan above deliberately skips a name preceded by a dot, so that member paths are
  // not mistaken for declarations — and that skip meant this bound nothing at all.
  //
  // The LAST SEGMENT is what carries, because that is the name the call site writes. Binding the
  // whole path would need the path escaped everywhere a carrier name is turned into a pattern, and
  // binding `c` rather than `o.c` over-approximates in the fail-closed direction: some other `x.c(`
  // in the same file would also count as reaching a verdict.
  for (const m of code.matchAll(/[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*\.\s*([A-Za-z_$][\w$]*)\s*(?:\?\?|\|\||&&)?=(?![=>])\s*/gu)) {
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
 * The names bound by a destructuring pattern, with the extent of the initialiser they came out of.
 *
 * `const [check] = [(f) => assert.ok(f)]` binds a function to a name without that name ever being
 * the initialiser of anything: the value arrived as an array element. A binder scan keyed on
 * `const NAME =` cannot see it, because after `const` comes `[`. The extent is the initialiser, so
 * containment still decides which pattern names carry — destructuring two checkers and a label out
 * of one array attributes to all three, which over-approximates in the fail-closed direction.
 *
 * `[^;]*?` rather than `[\s\S]*?` deliberately: a lazy span across statement boundaries let one
 * failed `const {` swallow every later declaration, and three honest files were flagged for it.
 */
function patternBindings(code) {
  const out = [];
  for (const m of code.matchAll(/(?:const|let|var)\s*([[{][^;]*?[\]}])\s*=(?!=)/gu)) {
    const from = m.index + m[0].length;
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
    for (const n of m[1].slice(1, -1).matchAll(/([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?/gu)) {
      const bound = n[2] ?? n[1];
      if (bound) out.push({ name: bound, start: from, end: i });
    }
  }
  return out;
}

/**
 * Does this function body hand back another function, rather than reaching a verdict itself?
 *
 * This is the whole of what makes the flow edge safe. `make()` returns a checker, so whatever
 * receives its result performs a verdict when called. `statesTable()` returns rows: its assertions
 * ran at the call, and its result is DATA. Both mention a carrier and both bind the result to a
 * name, so "mentions a carrier" cannot tell them apart — and when the edge was written that way it
 * flagged an honest parse loop in `front-door.test.mjs`. What the callee hands back can.
 */
function returnsFunction(body) {
  return /(?:^|\breturn\b)\s*(?:async\s*)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>/u.test(body)
    || /\breturn\s+(?:async\s+)?function\b/u.test(body);
}

/**
 * Does this expression carry a checker, given the carriers found so far?
 *
 * THE INVERSION, AND THE POINT OF THIS WHOLE MODULE. Default to YES, and subtract the one case that
 * is provably data: a carrier that is CALLED and does not hand back a function. `statesTable()` ran
 * its assertions at that line and returned rows. Everything else — an alias, a ternary branch, a
 * spread, an argument, a receiver, an element — is the function value still travelling.
 *
 * Round fourteen beat the previous version with seven ways of travelling in one sitting: `const chk
 * = mid`, a ternary, `??=`, `[...base]`, `.bind()`, `Map.get()`, an argument. Enumerating those is
 * the same mistake this module was written to end, three levels down: the sink space beat round two,
 * the syntax space beat round eleven, and the flow space would beat any list of edges. **The set of
 * ways a value can travel is open; the set of ways it stops is closed, and has one member.**
 *
 * It over-approximates, deliberately and in the required direction. A carrier mentioned for its name
 * rather than its behaviour — `check.name` in a message — makes its binding a carrier too. That is
 * fail-closed: it can cost a test an explicit liveness proof it did not strictly need, and it cannot
 * let a verdict over an empty subject through. The 36-file surface is what holds the cost honest.
 */
function carries(text, names, bodyOf) {
  for (const n of names) {
    let asValue = false;
    let asCallee = false;
    for (const m of text.matchAll(new RegExp("\\b" + n + "\\b(\\s*\\()?", "gu"))) {
      // CONSTRUCTION IS NOT A CALL WHOSE RESULT IS DATA. `new V()` yields an object holding V's
      // methods: the checker has not stopped travelling, it has been wrapped. Folding `new` into the
      // callee case dropped `class V { check(f) { assert.ok(f); } }` reached through
      // `const v = new V()` — caught for eleven rounds, and lost the moment the edges were unified.
      if (!m[1] || /\bnew\s+$/u.test(text.slice(0, m.index))) asValue = true;
      else asCallee = true;
    }
    if (asValue) return true;
    if (asCallee && returnsFunction(bodyOf.get(n) ?? "")) return true;
  }
  return false;
}

/** The index just past the balanced parenthesis opening at `open`, as inner text, or null. */
function balanced(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "(") depth += 1;
    else if (code[i] === ")") {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return null;
}

/** An argument list split on its top-level commas, so a nested call or literal does not split it. */
function splitArgs(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim());
}

/**
 * The parameter NAMES of the function this declaration binds, or null if it does not bind one.
 *
 * Only plain identifiers are returned. A destructured or defaulted parameter has no single name for
 * an argument to land in, and inventing one would connect an argument to something it did not bind.
 */
function parametersOf(code, decl) {
  const head = /^\s*(?:=\s*)?(?:async\s*)?\(([^)]*)\)\s*(?:=>|\{)/u.exec(code.slice(decl.start, decl.start + 400));
  if (!head) return null;
  return splitArgs(head[1]).map((p) => (/^[A-Za-z_$][\w$]*$/u.test(p) ? p : null));
}

/**
 * Names in this file from which a verdict can be reached — however the function behind them is
 * written, and however far the function VALUE has travelled from where it was written.
 *
 * WHY THIS IS A DATA-FLOW QUESTION. Round twelve beat name attribution four times over with a single
 * fault: attribution holds a NAME, and a function is a VALUE that flows. It comes out of a
 * destructuring, out of a factory's return, out of a derived collection. Each hop loses the name, and
 * the loop that finally calls it names something the attribution never saw. Adding a binder form per
 * hop is the enumeration this module already replaced once, one level up; the fix is to follow the
 * value instead of cataloguing the places it can land.
 *
 * THE MODEL. Two edges, applied to fixpoint:
 *
 *   CONTAINMENT   a verdict-reaching body inside a name's extent makes that name a carrier
 *   FLOW          a carrier reaching a new name through a binding makes that name a carrier
 *
 * CONTAINMENT credits EVERY containing declaration, not the innermost one. `{ len: (f) => ... }`
 * puts the checker inside `handlers` as surely as inside `len`, and a loop over `Object.values(
 * handlers)` never mentions `len`. The innermost rule was there to stop a helper nested in another
 * helper crediting its host; that case is now over-approximated rather than missed, which is the
 * direction this guard is required to err in, and the surface measurement is what holds it honest.
 */
export function verdictBearingNames(code) {
  const decls = [...declarations(code), ...patternBindings(code)];
  const names = new Set();
  /** The body of the function `n` names, for asking what it hands back. */
  const bodyOf = new Map();
  for (const [start, end] of functionBodies(code)) {
    const text = code.slice(start, end);
    for (const d of decls) {
      if (d.start <= start && d.end >= end && !bodyOf.has(d.name)) bodyOf.set(d.name, text);
    }
    if (!reaches(text)) continue;
    for (const d of decls) if (d.start <= start && d.end >= end) names.add(d.name);
  }

  // THE FLOW EDGES. Each moves a carrier across one binding. They run to fixpoint together, because
  // a checker can come out of a factory, be re-bound, land in a collection and be iterated, and no
  // single ordered pass gets every chain of those right.
  for (let changed = true; changed; ) {
    changed = false;

    // BINDING. Any expression that carries a checker makes the name it is bound to a carrier. This
    // is one rule, not one rule per way of writing a binding, and `carries` is where the judgement
    // lives — see there for why it defaults to yes.
    for (const d of decls) {
      if (names.has(d.name)) continue;
      if (carries(code.slice(d.start, d.end), names, bodyOf)) {
        names.add(d.name);
        changed = true;
      }
    }

    // ITERATION. A loop variable bound from anything carrying a checker carries it too:
    // `for (const h of Object.values(handlers)) h(f)`. The subject is an EXPRESSION, not a bare
    // name — restricting it to a bare name is what let a derived collection launder the checker,
    // since `Object.values(handlers)` mentions `handlers` and is not equal to it.
    for (const m of code.matchAll(/for\s*(?:await\s*)?\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s+of\s+((?:[^()\n]|\([^()\n]*\))*)\)/gu)) {
      if (names.has(m[1])) continue;
      if (carries(m[2], names, bodyOf)) {
        names.add(m[1]);
        changed = true;
      }
    }

    // ARGUMENT. A parameter that RECEIVES a checker at any call site carries it, so the verdict is
    // found inside a helper that was handed its check rather than holding one:
    //
    //     const run = (xs, fn) => { for (const f of xs) fn(f); };  run(files, chk);
    //
    // Nothing inside `run` names a carrier, and nothing at the call site is a loop. The verdict only
    // becomes visible when the argument is connected to the parameter it lands in. Positional and
    // one hop deep, which is all the shapes measured here need and all this can honestly claim.
    for (const d of decls) {
      const params = parametersOf(code, d);
      if (params === null) continue;
      for (const call of code.matchAll(new RegExp("\\b" + d.name + "\\s*\\(", "gu"))) {
        const args = balanced(code, call.index + call[0].length - 1);
        if (args === null) continue;
        splitArgs(args).forEach((arg, i) => {
          const p = params[i];
          if (p && !names.has(p) && carries(arg, names, bodyOf)) {
            names.add(p);
            changed = true;
          }
        });
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
