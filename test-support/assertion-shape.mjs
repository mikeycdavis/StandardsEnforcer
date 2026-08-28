/**
 * ST-16, second round. The shape of an assertion, asked in the direction that fails CLOSED.
 *
 * WHY THIS EXISTS. `consumptions()` in `subject-liveness.mjs` enumerates the ways a derived
 * collection can reach a passing verdict while empty: `.length, 0`, `deepEqual(X, [])`, a bound
 * count compared to zero. Every one of those is a SINK, and the list of sinks is open-ended. Two
 * specimens escaped the first round for exactly that reason and for no other:
 *
 *     assert.equal(files.length === 0 ? 0 : files.filter(p).length, 0);   // ternary
 *     assert.equal(files.filter(p).join(","), "");                        // join-empty
 *
 * Neither is exotic. They are the third and fourth sinks in a space that also contains `.toString()`,
 * `.at(0)`, `[0] === undefined`, `JSON.stringify(x) === "[]"`, `x?.length ?? 0`, and so on without
 * end. Adding a rule per sink is a race the sink space wins, which is what the first round's
 * "twelve of fourteen" number was actually measuring.
 *
 * THE INVERSION. Ask instead which assertions REFUTE emptiness — those that cannot pass when the
 * collection is empty. That set is small and closed: a non-zero expected count, a non-empty expected
 * array or string, a `> 0` bound, an `includes`/`some`/`find` that needs an element. Everything else
 * is treated as vacuity-prone. An unrecognised sink is therefore flagged rather than allowed, which
 * is INV-E1 applied to the discriminator itself: not knowing is not a pass.
 *
 * WHAT MAKES THIS READABLE AT ALL. `stripComments(code, { strings: true })` blanks string CONTENTS
 * but preserves the quotes and the length, so `""` and `"a,b"` arrive here as `""` and `"   "`. The
 * emptiness of an expected string survives the blanking. Nothing below would work otherwise.
 */

/** Assertion methods whose SECOND argument is the expected value. */
const EXPECTED_ARG = new Set(["equal", "strictEqual", "deepEqual", "deepStrictEqual"]);

/** ...and their negations, where an expected `[]` means "must NOT be empty". */
const NEGATED_EXPECTED = new Set(["notEqual", "notStrictEqual", "notDeepEqual", "notDeepStrictEqual"]);

/** Assertion methods whose FIRST argument is the whole condition. A bare `assert(x)` is one of these. */
const CONDITION_ARG = new Set(["ok", "assert"]);

/**
 * The receiver expression immediately left of `at`, by walking backwards over balanced brackets and
 * identifier characters. A regex cannot do this: `files.map((f) => !f.includes("X")).every(Boolean)`
 * nests parentheses, and the receiver of `.every` is the whole chain before it.
 *
 * This lives here rather than in `subject-liveness.mjs` because both modules need it — the negation
 * check below reads the character before the RECEIVER, not the character before the method, and
 * getting that wrong reads `!items.some(p)` as a proof of liveness when it is the exact inversion
 * that defeats one. `subject-liveness.mjs` re-exports it so its existing callers are unchanged.
 */
export function receiverBefore(code, at) {
  let i = at;
  let depth = 0;
  while (i > 0) {
    const c = code[i - 1];
    if (c === ")" || c === "]") depth += 1;
    else if (c === "(" || c === "[") {
      if (depth === 0) break;
      depth -= 1;
    } else if (depth === 0 && !/[\w$.]/u.test(c)) break;
    i -= 1;
  }
  return code.slice(i, at).trim();
}

/** The text between the parenthesis at `open` and its match, or null if unbalanced. */
export function balancedParens(code, open) {
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

/**
 * Split an argument list on its top-level commas. Commas inside nested calls, arrays, objects and
 * arrow parameter lists must not split, or `assert.deepEqual(x, [1, 2])` would read as three
 * arguments and the expected value would be `[1`.
 */
export function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim());
}

/** Every assertion call in the file, as `{ name, args, text, index }`. */
export function assertionCalls(code) {
  const out = [];
  for (const m of code.matchAll(/\bassert(?:\.(\w+))?\s*\(/gu)) {
    const open = m.index + m[0].length - 1;
    const inner = balancedParens(code, open);
    if (inner === null) continue;
    out.push({ name: m[1] ?? "assert", args: splitTopLevel(inner), text: inner, index: m.index });
  }
  return out;
}

/**
 * Is this expected value one an empty collection could not produce? Deliberately narrow: every
 * recogniser here is an EXEMPTION, and an exemption that is too generous re-opens the hole this
 * module exists to close.
 */
export function nonEmptyExpectation(expected) {
  const e = expected.trim();
  if (/^\d+$/u.test(e)) return Number(e) > 0;
  const arr = /^\[([\s\S]*)\]$/u.exec(e);
  if (arr) return arr[1].trim() !== "";
  const str = /^(["'`])([\s\S]*)\1$/u.exec(e);
  if (str) return str[2].length > 0;
  const obj = /^\{([\s\S]*)\}$/u.exec(e);
  if (obj) {
    // Recurse into the VALUES. `{ bad: [] }` is a non-empty object literal whose only value is an
    // empty array, so it is no evidence that anything was examined — reading only the braces
    // exempted a wrapped verdict that was vacuous inside.
    return splitTopLevel(obj[1]).some((entry) => {
      const colon = entry.indexOf(":");
      return colon !== -1 && nonEmptyExpectation(entry.slice(colon + 1));
    });
  }
  return false;
}

/**
 * Does this condition fail on an empty collection? `> 0` and `>= 1` are lower bounds; `> 0` is also
 * written `!== 0`. `some`, `find` and `includes` each need an element to be true, so an UNNEGATED
 * one refutes emptiness — the negated form does the opposite and is handled as a consumption by
 * `subject-liveness.mjs`, which is where that inversion was found in the first place.
 */
export function refutingCondition(cond) {
  for (const m of cond.matchAll(/[.](?:length|size)\s*(>=|>|!==|!=)\s*(\d+)/gu)) {
    const n = Number(m[2]);
    if (m[1] === ">" && n >= 0) return true;
    if (m[1] === ">=" && n >= 1) return true;
    if ((m[1] === "!==" || m[1] === "!=") && n === 0) return true;
  }
  // `has` joins `some`/`find`/`includes`: a membership test against an EMPTY collection is false, so
  // `assert.ok(known.has(s))` cannot pass with `known` empty. A lookup table is self-live, and
  // demanding a separate proof of it flagged an honest guard whose emptiness would have failed it.
  for (const m of cond.matchAll(/[.](?:some|find|includes|has)\s*\(/gu)) {
    const recv = receiverBefore(cond, m.index);
    const before = cond.slice(0, m.index - recv.length).trimEnd();
    if (!before.endsWith("!")) return true;
  }
  return false;
}

/**
 * Does this assertion refute emptiness of whatever collection feeds it? The assertion MESSAGE is
 * never consulted: almost every honest assertion carries a non-empty message string, so reading the
 * whole call rather than the expected argument would exempt the entire suite and silently restore
 * the fail-open behaviour this module replaces.
 */
export function refutesEmptiness(call, liveNames = new Set()) {
  const { name, args } = call;
  if (CONDITION_ARG.has(name)) return refutingCondition(args[0] ?? "");
  if (EXPECTED_ARG.has(name)) {
    // An expected value that is a NAME this file has already proven non-empty refutes emptiness just
    // as a literal would. `assert.deepEqual(codes.sort(), real)` cannot hold with `codes` empty once
    // `assert.ok(real.length > 0)` has run — and requiring the expectation to be spelled as a literal
    // would be a naming convention, not a liveness rule.
    const expected = (args[1] ?? "").trim();
    if (/^[A-Za-z_$][\w$]*$/u.test(expected) && liveNames.has(expected)) return true;
    // A stringifying sink destroys the emptiness signal: `JSON.stringify([])` is `"[]"`, a NON-empty
    // string, so a non-empty expectation stops being evidence of a non-empty collection. Because
    // string contents arrive here blanked to spaces, `"[]"` and `"ab"` are indistinguishable — the
    // exemption cannot be rescued by reading it, so it is withdrawn. Fail closed.
    // `.toString()` and `String(...)` are the same sink: `[].length.toString()` is `"0"`, a NON-empty
    // string, so the expectation stops being evidence about the collection.
    if (/\b(?:JSON\.stringify|String)\s*\(|\.toString\s*\(/u.test(args[0] ?? "")) return false;
    return nonEmptyExpectation(args[1] ?? "");
  }
  if (NEGATED_EXPECTED.has(name)) {
    const e = (args[1] ?? "").trim();
    return /^\[\s*\]$/u.test(e) || /^(["'`])\1$/u.test(e) || e === "0";
  }
  // match/doesNotMatch/throws/rejects and anything unrecognised: no claim either way, so no
  // exemption. Fail closed.
  return false;
}
