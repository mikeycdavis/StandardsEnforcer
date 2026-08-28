/**
 * ST-16. Subject liveness: what collection did this test CONSUME, and did it prove that collection
 * had elements?
 *
 * WHY NOT ST-15's QUESTION. `verdict-liveness.mjs` asks what the verdict looks like — an array
 * declared empty, pushed to, asserted empty. That recognises one shape, and three others reach the
 * same false green without it (measured on main@3c02014, all three passing):
 *
 *     const offenders = files.filter(p); assert.deepEqual(offenders, []);   // derived, not accumulated
 *     for (const f of files) assert.ok(p(f));                               // nothing survives the loop
 *     assert.ok(files.every(p));                                            // vacuously true
 *
 * The third has no collection-valued verdict at all, and the second has no verdict outside the loop.
 * Asking about the verdict cannot see them. Asking about the SUBJECT can, because all three consume
 * a collection in a way that succeeds when the collection is empty.
 *
 * WHAT COUNTS AS VACUITY-PRONE. Only consumptions whose success survives an empty subject:
 *
 *     for (const x of S) { ...assert... }   body never runs
 *     S.forEach(x => { ...assert... })      callback never runs
 *     S.filter(p) / S.map(p) / S.flatMap(p) yields [], then asserted empty
 *     S.every(p)                            vacuously true
 *
 * `some`, `find` and `reduce`-without-initial are deliberately ABSENT: on an empty subject they are
 * falsy or they throw, so an assertion over them fails rather than passes. They are self-live, and
 * listing them would redden honest tests — the criterion this mechanism is most at risk of failing,
 * since its net is wider than ST-15's.
 *
 * A LOOP IS NOT AUTOMATICALLY A VERDICT. Iterating to build data is not asserting anything, so only
 * a loop whose body actually asserts is treated as verdict-bearing. Without that, every data-shaping
 * loop in the suite would demand a liveness proof it has no business making.
 */

import { livenessAssertions } from "./verdict-liveness.mjs";

/** Methods whose result is satisfied by an empty receiver. See the note above on `some`/`find`. */
export const VACUOUS_METHODS = ["filter", "map", "flatMap", "every", "forEach"];

/** An identifier, a member chain, or a single call — the receiver text we treat as the subject. */
const SUBJECT = /[A-Za-z_$][\w$.]*(?:\([^()\n]*\))?/;

/**
 * The body that `from` introduces. A braceless single-statement body is its own body and NOTHING
 * else: an earlier draft scanned forward to the next `{` anywhere, so
 *
 *     for (const c of a.controls) c.source = "rulesets";
 *
 * borrowed the assertions of some unrelated block further down the file and was reported as a
 * verdict-bearing loop. Three honest files were flagged that way — the exact failure mode that
 * makes a discriminator worse than no discriminator.
 */
export function blockAt(code, from) {
  const rest = code.slice(from);
  const lead = /^\s*/u.exec(rest)[0].length;
  if (rest[lead] !== "{") {
    const end = rest.indexOf(";", lead);
    return end === -1 ? rest.slice(lead) : rest.slice(lead, end + 1);
  }
  const open = from + lead;
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "{") depth += 1;
    else if (code[i] === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return code.slice(open + 1); // unbalanced; treat the remainder as the body rather than guessing
}

/**
 * The receiver expression immediately left of `at`, by walking backwards over balanced brackets and
 * identifier characters. A regex cannot do this: `files.map((f) => !f.includes("X")).every(Boolean)`
 * nests parentheses, and the receiver of `.every` is the whole chain before it.
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

/**
 * Strip transforms that carry emptiness through unchanged, so the liveness question lands on the
 * collection that was actually discovered. `files.map(p).filter(q)` is empty exactly when `files`
 * is, so `files` is the subject worth proving.
 */
export function rootSubject(text) {
  let cur = text.trim();
  for (;;) {
    if (/^Object[.](?:entries|values|keys)[(]/u.test(cur)) return cur;
    const next = cur.replace(/\.(?:map|filter|flat|flatMap|entries|sort|slice|concat|reverse)\s*\((?:[^()]|\([^()]*\))*\)$/u, "").replace(/\.(?:flat|entries|sort|reverse)$/u, "").trim();
    if (next === cur || next === "") return cur;
    cur = next;
  }
}

/**
 * Names of functions defined in this file whose bodies assert. A loop that calls one of them is
 * making a verdict just as surely as a loop that asserts inline:
 *
 *     function check(f) { assert.ok(p(f)); }
 *     for (const f of files) check(f);
 *
 * Without this the indirection alone defeats the mechanism, and one level of indirection is not an
 * exotic shape — it is how a test with more than one case is normally written.
 */
export function assertingHelpers(code) {
  const names = new Set();
  const decls = [
    /function\s+([A-Za-z_$][\w$]*)\s*\(/gu,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)/gu,
  ];
  for (const re of decls) {
    for (const m of code.matchAll(re)) {
      const body = blockAt(code, m.index + m[0].length);
      if (/assert\s*[.(]/u.test(body)) names.add(m[1]);
    }
  }
  return names;
}

/** Does this body reach an assertion, directly or through one of the file's asserting helpers? */
export function bodyAsserts(code, body) {
  if (/assert\s*[.(]/u.test(body)) return true;
  for (const name of assertingHelpers(code)) {
    if (new RegExp(String.raw`\b${name}\s*\(`, "u").test(body)) return true;
  }
  return false;
}

/**
 * Every consumption in this file that would succeed on an empty subject, as `{ subject, via }`.
 * `subject` is source text, not a value: this is a scan, and it says so rather than pretending to
 * resolve aliases.
 */
export function consumptions(code) {
  const found = [];

  // for (const x of S) { ... } — verdict-bearing only if the body asserts.
  const forOf = new RegExp(String.raw`for\s*(?:await\s*)?\(\s*(?:const|let|var)\s+[^)]*?\s+of\s+(${SUBJECT.source})\s*\)`, "gu");
  for (const m of code.matchAll(forOf)) {
    const body = blockAt(code, m.index + m[0].length);
    if (bodyAsserts(code, body)) found.push({ subject: m[1], via: "for-of" });
  }

  // for (const k in T) — the same vacuity with a different keyword.
  const forIn = new RegExp(String.raw`for\s*\(\s*(?:const|let|var)\s+[A-Za-z_$][\w$]*\s+in\s+(${SUBJECT.source})\s*\)`, "gu");
  for (const m of code.matchAll(forIn)) {
    const body = blockAt(code, m.index + m[0].length);
    if (bodyAsserts(code, body)) found.push({ subject: m[1], via: "for-in" });
  }

  // while (Q.length) { ... } — a loop whose every iteration is gated on the subject having elements.
  const whileLen = new RegExp(String.raw`while\s*\(\s*(${SUBJECT.source})(?:\.(?:length|size))?\s*(?:>\s*0\s*)?\)`, "gu");
  for (const m of code.matchAll(whileLen)) {
    const body = blockAt(code, m.index + m[0].length);
    if (bodyAsserts(code, body)) found.push({ subject: m[1].replace(/[.](?:length|size)$/u, ""), via: "while" });
  }

  // S.forEach(x => { ... }) — the same shape wearing a different hat.
  const each = new RegExp(String.raw`(${SUBJECT.source})(?:\?)?\.forEach\s*\(`, "gu");
  for (const m of code.matchAll(each)) {
    const body = blockAt(code, m.index + m[0].length);
    if (bodyAsserts(code, body)) found.push({ subject: m[1], via: "forEach" });
  }

  // assert.ok(S.every(p)) — vacuously true, and its subject is the receiver.
  // assert.ok(<chain>.every(p)) — vacuously true. The receiver is found by walking left rather than
  // by regex, because it may be a chain containing nested parentheses.
  for (const m of code.matchAll(/(?:\?)?\.every\s*\(/gu)) {
    const recv = receiverBefore(code, m.index);
    if (recv !== "") found.push({ subject: rootSubject(recv), via: "every" });
  }

  // const X = S.filter(p) — vacuity-prone only if X is then asserted empty.
  const derived = new RegExp(String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(${SUBJECT.source})\.(?:filter|map|flatMap)\s*\(`, "gu");
  const reduced = new RegExp(String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(${SUBJECT.source})\.reduce\s*\(`, "gu");
  const emptied = emptyAsserted(code);
  for (const m of code.matchAll(reduced)) {
    if (emptied.has(m[1])) found.push({ subject: m[2], via: "reduce" });
  }

  for (const m of code.matchAll(derived)) {
    if (emptied.has(m[1])) found.push({ subject: m[2], via: "derived" });
  }

  // assert.equal(S.filter(p).length, 0) — the same thing with no name to bind.
  const chained = new RegExp(String.raw`assert\.(?:equal|strictEqual)\s*\(\s*(${SUBJECT.source})\.(?:filter|map|flatMap)\s*\([^\n]*?\)\.length\s*,\s*0`, "gu");
  for (const m of code.matchAll(chained)) found.push({ subject: m[1], via: "chained" });

  // assert.ok(!S.some(p)) — the negation turns `some`'s emptiness-safety inside out. `some` is
  // exempt as a LIVENESS proof precisely because it is false on an empty subject; negated, that same
  // falsity becomes a pass. The exemption was mine, and this is the shape that defeats it.
  for (const m of code.matchAll(new RegExp("!" + String.raw`\s*(SUBJ)(?:\?)?\.(?:some|find)\s*\(`.replace("SUBJ", SUBJECT.source), "gu"))) {
    found.push({ subject: m[1], via: "negated-some" });
  }

  // assert.deepEqual(Object.keys(X), []) — the collection is consumed by the static method and the
  // verdict is emptiness, with no binding anywhere to notice.
  for (const m of code.matchAll(/assert[.](?:deepEqual|deepStrictEqual)\s*[(]\s*Object[.](?:keys|values|entries)[(]\s*([A-Za-z_$][\w$.]*)\s*[)]\s*,\s*\[\s*\]/gu)) {
    found.push({ subject: m[1], via: "keys-empty" });
  }

  // const n = S.filter(p).length; assert.equal(n, 0) — the count is bound, not the collection, so a
  // rule watching for an empty ARRAY sees nothing to watch.
  const counted = new RegExp(String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(SUBJ)\.(?:filter|map|flatMap)\s*\((?:[^()]|\([^()]*\))*\)\.length`.replace("SUBJ", SUBJECT.source), "gu");
  for (const m of code.matchAll(counted)) {
    if (new RegExp(String.raw`assert[.](?:equal|strictEqual)\s*[(]\s*${m[1]}\s*,\s*0`, "u").test(code)) {
      found.push({ subject: m[2], via: "counted" });
    }
  }

  return found.map((c) => ({ ...c, subject: rootSubject(c.subject) }));
}

/** Names this file asserts to be an empty collection. */
export function emptyAsserted(code) {
  const hits = new Set();
  const pats = [
    /assert[.](?:deepEqual|deepStrictEqual)\s*[(]\s*([A-Za-z_$][\w$]*)\s*,\s*\[\s*\]/gu,
    /assert[.](?:equal|strictEqual)\s*[(]\s*([A-Za-z_$][\w$]*)[.]length\s*,\s*0\s*[)]/gu,
  ];
  for (const re of pats) for (const m of code.matchAll(re)) hits.add(m[1]);
  return hits;
}

/**
 * A subject is proven live if this file asserts a lower bound on it, or on the name it was bound
 * from. Reuses ST-15's `livenessAssertions`, which already distinguishes `> 0` from `>= 0` and
 * accepts an exact non-zero count as the stronger claim it is.
 */
export function provenLive(code, subject) {
  const live = livenessAssertions(code);
  if (live.has(subject) || livenessFromExpectation(code).has(subject)) return true;

  // `const files = testFiles(ROOT)` proves liveness for the call text too, when the binding is live.
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/gu)) {
    if (m[2].trim().replace(/;$/u, "") === subject && live.has(m[1])) return true;
  }
  // A subject that is a call or a member chain — `Object.values(STATE)`, `hostTreeAsSubject(code)` —
  // cannot be matched by an identifier pattern, so its liveness is checked against the subject text
  // itself. Without this, the only way to prove such a subject live would be to restructure the test
  // that consumes it, and a mechanism that dictates how honest tests must be spelled is a naming
  // convention wearing a scanner's clothes.
  const bound = new RegExp(
    String.raw`assert[.]ok\s*[(]\s*` + escapeRe(subject) + String.raw`[.](?:length|size)\s*(>=?)\s*(\d+)`, "u");
  const b = bound.exec(code);
  if (b && (b[1] === ">" ? Number(b[2]) >= 0 : Number(b[2]) >= 1)) return true;

  // `assert.ok(S.some(p))` fails on an empty S, so it establishes liveness for S.
  const some = new RegExp("(?<![!])" + String.raw`assert(?:\.\w+)?\s*\(\s*` + escapeRe(subject) + String.raw`\.(?:some|find)\s*\(`, "u");
  return some.test(code);
}

// Built without a literal backslash: this file is written through a shell heredoc, and an
// escaped class here silently loses one level of escaping on the way in.
const RE_SPECIAL = new Set([".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", String.fromCharCode(92)]);

function escapeRe(s) {
  return [...s].map((c) => (RE_SPECIAL.has(c) ? String.fromCharCode(92) + c : c)).join("");
}

/**
 * `assert.deepEqual(X, ["OUT_OF_SCOPE"])` proves X had an element — the expected value is non-empty,
 * so the assertion cannot hold on an empty X. This is liveness stated as an exact value rather than
 * as a bound, and it is how `enforce.test.mjs` establishes `PASSING` on the line above the loop that
 * consumes it. Missing it would have reddened an honest guard, which is the failure mode this
 * mechanism is most exposed to.
 *
 * Unwraps the shapes that preserve emptiness on the way in: `[...X]`, `.sort()`, `.map(f)`. An empty
 * X survives all three as empty, so a non-empty expectation still proves X non-empty.
 */
export function livenessFromExpectation(code) {
  const hits = new Set();
  const re = /assert[.](?:deepEqual|deepStrictEqual)\s*[(]\s*([^,]+?)\s*,\s*\[\s*([^\]\s])/gu;
  for (const m of code.matchAll(re)) {
    if (m[2] === "]") continue;
    let expr = m[1].trim();
    for (;;) {
      const next = expr
        .replace(/\.sort\s*\([^()]*\)$/u, "")
        .replace(/\.map\s*\([^()]*\)$/u, "")
        .replace(/^\[\s*\.\.\.(.+)\]$/u, "$1")
        .trim();
      if (next === expr) break;
      expr = next;
    }
    hits.add(expr);
  }
  return hits;
}

/**
 * A collection spelled out in this file cannot be empty at execution time, so demanding a runtime
 * proof of it is nonsense — the same category error ST-15 avoided by not requiring liveness of
 * `f.kinds`. This exemption is about STATIC certainty, not about convenience: it applies only when
 * the literal is visible here and visibly has entries.
 *
 * Unwraps `Object.entries|values|keys(X)` and `[...X]`, because a table iterated through one of
 * those is still that table.
 */
export function staticallyNonEmpty(code, subject) {
  const name = unwrap(subject);
  if (name === null) return false;
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([[{])/gu)) {
    if (m[1] !== name) continue;
    const open = m.index + m[0].length - 1;
    const body = balanced(code, open, m[2], m[2] === "[" ? "]" : "}");
    if (body.trim() !== "") return true;
  }
  return false;
}

/** `Object.entries(X)` / `[...X]` / `X` -> `X`. Anything else -> null. */
function unwrap(subject) {
  const wrapped = /^Object\.(?:entries|values|keys)\((.+)\)$/u.exec(subject);
  const inner = (wrapped ? wrapped[1] : subject).trim();
  const spread = /^\[\s*\.\.\.(.+)\]$/u.exec(inner);
  const bare = (spread ? spread[1] : inner).trim();
  return /^[A-Za-z_$][\w$]*$/u.test(bare) ? bare : null;
}

function balanced(code, open, o, c) {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === o) depth += 1;
    else if (code[i] === c) {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return "";
}

/** The subjects this file consumes vacuum-safely without ever proving they had elements. */
export function vacuousSubjects(code) {
  const out = [];
  for (const c of consumptions(code)) {
    if (staticallyNonEmpty(code, c.subject)) continue;
    if (!provenLive(code, c.subject)) out.push(`${c.subject} (${c.via})`);
  }
  return [...new Set(out)].sort();
}
