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
import { assertionCalls, refutesEmptiness, receiverBefore, balancedParens, splitTopLevel } from "./assertion-shape.mjs";
import { verdictBearingNames } from "./helper-attribution.mjs";

export { receiverBefore };

/** Methods whose result is satisfied by an empty receiver. See the note above on `some`/`find`. */
export const VACUOUS_METHODS = ["filter", "map", "flatMap", "every", "forEach"];

/**
 * An identifier, a member chain, or a single call — the receiver text we treat as the subject.
 *
 * `?.` is part of a member chain here, so `for (const f of files?.list)` has the subject `files?.list`
 * rather than no subject at all. Every DERIVATION rule below already reads optional chaining —
 * `(?:\?)?\.` appears in six of them — so admitting it in the subject makes one mechanism consistent
 * with itself rather than adding a shape to it. The surface writes `?.` in seven of its files, so
 * this is the repository's ordinary dialect and not an imagined one.
 */
const SUBJECT = /[A-Za-z_$](?:[\w$.]|\?\.)*(?:\([^()\n]*\))?/;

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
 * Strip transforms that carry emptiness through unchanged, so the liveness question lands on the
 * collection that was actually discovered. `files.map(p).filter(q)` is empty exactly when `files`
 * is, so `files` is the subject worth proving.
 */
const PRESERVING = new Set(["map", "filter", "flat", "flatMap", "entries", "sort", "slice", "concat", "reverse"]);

export function rootSubject(text) {
  let cur = text.trim();
  for (;;) {
    if (/^Object[.](?:entries|values|keys)[(]/u.test(cur)) return cur;
    let next = cur;
    // Strip one trailing `.method(...)` by walking the brackets, not by regex. A callback body can
    // contain newlines and braces — `trackedFiles().filter((f) => {\n ... \n})` — and the regex this
    // replaced could not match across them, so the subject was reported as a truncated fragment.
    if (next.endsWith(")")) {
      let depth = 0;
      let i = next.length;
      for (; i > 0; i -= 1) {
        const c = next[i - 1];
        if (c === ")" || c === "]" || c === "}") depth += 1;
        else if (c === "(" || c === "[" || c === "{") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      const head = next.slice(0, i - 1);
      const m = /\.([A-Za-z_$][\w$]*)$/u.exec(head);
      if (depth === 0 && m && PRESERVING.has(m[1])) next = head.slice(0, m.index).trim();
    }
    // Unwrap the constructors and copies that carry emptiness through: `new Set(files)` is empty
    // exactly when `files` is, and so are `new Map(...)`, `Array.from(...)` and `Object.freeze(...)`.
    // Without this, `for (const f of new Set(files))` reports the wrapper as the subject and no
    // liveness assertion the author could write would ever name it.
    // `await` and `Promise.all(...)` are transparent to emptiness: awaiting a settled array of N
    // promises yields N results. Without this, `const [a, b] = await Promise.all([p, q])` reports
    // the whole await expression as the subject and the two-element literal behind it is never seen.
    next = next.replace(/^await\s+/u, "").trim();
    const all = /^Promise\.(?:all|allSettled)\s*\(([\s\S]*)\)$/u.exec(next);
    if (all && all[1].trim() !== "") next = all[1].trim();
    const wrap = /^(?:new\s+(?:Set|Map)|Array\.from|Object\.freeze|structuredClone)\s*\(([\s\S]*)\)$/u.exec(next);
    if (wrap) {
      const inner = wrap[1].trim();
      if (inner !== "") next = inner;
    }
    // Only a PURE single spread: `[...files]` is empty exactly when `files` is, but
    // `[...spellings, undefined, null]` has elements of its own and is not.
    const spread = /^\[\s*\.\.\.([A-Za-z_$][\w$.]*(?:\([^()]*\))?)\s*\]$/u.exec(next);
    if (spread) next = spread[1].trim();
    next = next.replace(/\.(?:flat|entries|sort|reverse)$/u, "").trim();
    if (next === cur || next === "") return cur;
    cur = next;
  }
}

/**
 * The expression beginning at `start`, ending at the `;` or newline that is not inside brackets. A
 * binding's value routinely spans lines, and stopping at the first newline yields a fragment that
 * resolves to nothing.
 */
function expressionAt(code, start) {
  let depth = 0;
  for (let i = start; i < code.length; i += 1) {
    const c = code[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return code.slice(start, i);
      depth -= 1;
    } else if (depth === 0 && (c === ";" || c === "\n")) return code.slice(start, i);
  }
  return code.slice(start);
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
      if (/assert\s*[.(]/u.test(body) || /\bthrow\b/u.test(body)) names.add(m[1]);
    }
  }
  return names;
}

/**
 * Does this body reach a verdict, directly or through one of the file's asserting helpers?
 *
 * `throw` counts. A loop that throws on a bad element is making exactly the same claim as one that
 * asserts on it, and reaches the same false green when the collection is empty:
 *
 *     for (const f of files) { if (!ok(f)) throw new Error("bad file"); }
 *
 * Recognising only the token `assert` would have let the whole throwing dialect through, which is
 * not an exotic dialect — it is how a helper reports a problem when it has no assert in scope.
 *
 * `imported` carries names this file imports from repository modules whose definitions reach a
 * verdict, resolved by `verdict-language.mjs`. It defaults to empty, so every caller that passes only
 * a string — including this module's own unit tests — behaves exactly as before. Without it, a
 * wrapper imported from a sibling module defeated the mechanism as thoroughly as no wrapper at all.
 *
 * `verdictBearingNames` supplies the rest: names in THIS file that reach a verdict, found by locating
 * function bodies structurally rather than by enumerating the syntaxes a function can be declared in.
 * That enumeration lost to six ordinary spellings in one adversarial round.
 */
export function bodyAsserts(code, body, imported = new Set()) {
  if (/assert\s*[.(]/u.test(body) || /\bthrow\b/u.test(body)) return true;
  // A verdict-bearing name may be CALLED (`check(f)`), used as a RECEIVER (`H.check(f)`,
  // `M.get("len")(f)`, `box.verdict`), INDEXED, or TAGGED (`` must`...` ``). Testing only for
  // `name(` missed six of round eleven's twenty shapes, every one of which reached its verdict
  // through a name the attribution had already identified correctly.
  for (const name of new Set([...assertingHelpers(code), ...verdictBearingNames(code), ...imported])) {
    if (new RegExp("\\b" + name + "\\s*(?:[(.[`]|\\?\\.)", "u").test(body)) return true;
  }
  return false;
}

/**
 * Does this body accumulate into an outer name that later reaches a verdict? The assertion has
 * simply been moved past the closing brace:
 *
 *     let bad = false;  for (const f of files) bad ||= !ok(f);   assert.ok(!bad);
 *     let n = 0;        for (const f of files) if (!ok(f)) n++;  assert.equal(n, 0);
 *
 * Neither body contains the word `assert`, and both are false green on empty `files`.
 *
 * This is kept SEPARATE from `bodyAsserts` because it needs a check that a directly-asserting body
 * does not: nearly every guard in this suite iterates its own offenders list to build a message, and
 * `for (const s of vacuousSubjects(code)) offenders.push(...)` accumulates in exactly this shape
 * while being the opposite of a defect — an empty offenders list is the success. The caller only
 * treats accumulation as a verdict when the subject is NOT grounded in something proven live.
 */
export function bodyAccumulates(code, body) {
  for (const m of body.matchAll(/([A-Za-z_$][\w$]*)\s*(?:\+\+|\+=|\|\|=|&&=|\.(?:push|set|add|delete)\s*\(|\[[^\]]*\]\s*=(?!=)|=(?!=))/gu)) {
    if (/(?:const|let|var)\s+$/u.test(body.slice(0, m.index))) continue; // a declaration, not an accumulation
    if (mentionedInAssertion(code, m[1]) && !provenByName(code, m[1])) return true;
  }
  return false;
}

/**
 * An argument list that is a bare function REFERENCE, rewritten as the call it is about to become.
 *
 * `files.forEach(check)` hands `check` to a consumer whose entire job is to call it. Reading the
 * argument as `check(` is what lets every rule that already recognises a verdict-bearing call see
 * this one, instead of each rule growing a by-reference case of its own. Anything that is not a
 * plain identifier or member path — an inline arrow, a call, a literal — is returned untouched.
 */
function callForm(args) {
  const text = (args ?? "").trim();
  return /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*$/u.test(text) ? text + "(" : null;
}

/**
 * Every consumption in this file that would succeed on an empty subject, as `{ subject, via }`.
 * `subject` is source text, not a value: this is a scan, and it says so rather than pretending to
 * resolve aliases.
 *
 * `imported` is passed through to `bodyAsserts`; see there for what it carries and why it defaults
 * to empty.
 */
export function consumptions(code, imported = new Set()) {
  const found = [];
  const grounded = groundedNames(code);

  /** Does this expression descend from something this file proved non-empty? */
  const groundedExpr = (text) =>
    [...grounded].some((g) => new RegExp(String.raw`\b${g}\b`, "u").test(text));

  /**
   * Is this loop reaching a verdict? Asserting or throwing always counts. Accumulating counts only
   * when the subject is not grounded — otherwise every guard that iterates its own offenders list to
   * build a failure message would be reported as a vacuous verdict over that list.
   */
  const isVerdict = (body, subject) =>
    bodyAsserts(code, body, imported) || (bodyAccumulates(code, body) && !groundedExpr(subject));

  // for (const x of S) { ... } — verdict-bearing only if the body asserts.
  // `?? []` and `|| []` are absorbed: `for (const f of files ?? [])` iterates `files`, and the
  // fallback makes the empty case MORE reachable rather than less.
  // `(?:new\s+)?` so `for (const f of new Set(files))` is seen: without it the subject pattern
  // matched the bare word `new` and the whole loop went unnoticed.
  const forOf = new RegExp(String.raw`for\s*(?:await\s*)?\(\s*(?:const|let|var)\s+[^)]*?\s+of\s+((?:new\s+)?${SUBJECT.source}|\[[^\]]*\])(?:\s*(?:\?\?|\|\|)\s*\[\s*\])?\s*\)`, "gu");
  for (const m of code.matchAll(forOf)) {
    const body = blockAt(code, m.index + m[0].length);
    if (isVerdict(body, m[1])) found.push({ subject: m[1], via: "for-of" });
  }

  // while (i < S.length) { ...assert... } — an index loop over S, which runs zero times when S is
  // empty exactly as `for..of` does. The `while (Q.length)` rule below only sees the subject as the
  // whole condition, so an index comparison walks past it.
  const indexWhile = new RegExp(String.raw`while\s*\(\s*[A-Za-z_$][\w$]*\s*<\s*(${SUBJECT.source})\.(?:length|size)\s*\)`, "gu");
  for (const m of code.matchAll(indexWhile)) {
    const body = blockAt(code, m.index + m[0].length);
    if (isVerdict(body, m[1])) found.push({ subject: m[1], via: "index-while" });
  }

  // for (let i = 0; i < S.length; i += 1) { ...assert... } — the C-style form of the same loop, and
  // the oldest way to write it. Its body runs zero times on an empty S exactly as `for..of` does.
  const cStyle = new RegExp(String.raw`for\s*\([^;]*;\s*[A-Za-z_$][\w$]*\s*<\s*(${SUBJECT.source})\.(?:length|size)\s*;`, "gu");
  for (const m of code.matchAll(cStyle)) {
    const head = balancedParens(code, code.indexOf("(", m.index));
    if (head === null) continue;
    const body = blockAt(code, code.indexOf("(", m.index) + head.length + 2);
    if (isVerdict(body, m[1])) found.push({ subject: m[1], via: "c-for" });
  }

  // do { ...assert... } while (i < S.length) — the body runs once, so an empty S means asserting
  // against `S[0]`, which is `undefined`. Every guard in this suite written that way skips its work
  // on the undefined element and reaches the same false green.
  const doWhile = new RegExp(String.raw`\bdo\b`, "gu");
  for (const m of code.matchAll(doWhile)) {
    const body = blockAt(code, m.index + 2);
    const tail = code.slice(m.index + 2 + body.length, m.index + 2 + body.length + 200);
    const w = new RegExp(String.raw`while\s*\(\s*[A-Za-z_$][\w$]*\s*<\s*(${SUBJECT.source})\.(?:length|size)`, "u").exec(tail);
    if (w && isVerdict(body, w[1])) found.push({ subject: w[1], via: "do-while" });
  }

  // for (const k in T) — the same vacuity with a different keyword.
  const forIn = new RegExp(String.raw`for\s*\(\s*(?:const|let|var)\s+[A-Za-z_$][\w$]*\s+in\s+(${SUBJECT.source})\s*\)`, "gu");
  for (const m of code.matchAll(forIn)) {
    const body = blockAt(code, m.index + m[0].length);
    if (isVerdict(body, m[1])) found.push({ subject: m[1], via: "for-in" });
  }

  // while (Q.length) { ... } — a loop whose every iteration is gated on the subject having elements.
  const whileLen = new RegExp(String.raw`while\s*\(\s*(${SUBJECT.source})(?:\.(?:length|size))?\s*(?:>\s*0\s*)?\)`, "gu");
  for (const m of code.matchAll(whileLen)) {
    const body = blockAt(code, m.index + m[0].length);
    if (isVerdict(body, m[1])) found.push({ subject: m[1].replace(/[.](?:length|size)$/u, ""), via: "while" });
  }

  // S.forEach(x => { ... }) — the same shape wearing a different hat. `map`, `filter` and `flatMap`
  // are included because a callback that asserts is iterating whatever its result is used for, and
  // discarding that result is the commonest way to write it:
  //
  //     files.map((f) => { assert.ok(ok(f)); });
  //     await Promise.all(files.map(async (f) => { assert.ok(await ok(f)); }));
  //
  // Neither binds the result, so no rule about a derived collection can see them.
  const each = new RegExp(String.raw`(${SUBJECT.source})(?:\?)?\.(?:forEach|map|flatMap|filter|reduce)\s*\(`, "gu");
  for (const m of code.matchAll(each)) {
    const at = m.index + m[0].length;
    // The callback is usually written inline, and then the body is the block that follows. It may
    // also be passed BY REFERENCE — `files.forEach(check)` — and then there is no block here at all:
    // the body that matters belongs to the name, and this loop saw an empty string and concluded the
    // iteration reached no verdict. `forEach` is about to CALL what it was handed, so a bare
    // reference is read as the call it is about to become, and the existing verdict rules see it
    // without needing a rule of their own for the by-reference shape.
    //
    // Decided from the ARGUMENT LIST, not from the absence of a block: `blockAt` treats a braceless
    // body as its own statement and so returns `check);` here rather than nothing, which is correct
    // for every other caller and useless as a signal for this one.
    const byReference = callForm(balancedParens(code, at - 1));
    const body = byReference ?? blockAt(code, at);
    if (isVerdict(body, m[1])) found.push({ subject: m[1], via: "forEach" });
  }

  // try { for (const f of files) validate(f); } catch { assert.fail(...) } — the loop body reaches
  // no verdict of its own; the verdict is the catch. On an empty subject nothing runs, nothing
  // throws, and the catch never fires, so the whole construct is a pass that examined nothing.
  for (const m of code.matchAll(/\btry\s*\{/gu)) {
    const tryBody = blockAt(code, m.index + 3);
    const after = code.slice(m.index + 4 + tryBody.length, m.index + 4 + tryBody.length + 400);
    const cat = /^\s*\}?\s*catch\s*(?:\([^)]*\))?\s*\{/u.exec(after);
    if (!cat) continue;
    const catchBody = blockAt(after, cat.index + cat[0].length - 1);
    if (!bodyAsserts(code, catchBody, imported)) continue;
    for (const f of tryBody.matchAll(forOf)) {
      found.push({ subject: f[1], via: "try-catch" });
    }
  }

  // while ((f = files.pop())) { ...assert... } — the loop condition is an assignment that is falsy
  // the moment the collection is empty, so the body never runs.
  const drain = new RegExp(String.raw`while\s*\(\s*\(?\s*[A-Za-z_$][\w$]*\s*=\s*(${SUBJECT.source})\.(?:pop|shift)\s*\(`, "gu");
  for (const m of code.matchAll(drain)) {
    const body = blockAt(code, code.indexOf(")", m.index + m[0].length) + 1);
    if (isVerdict(body, m[1])) found.push({ subject: m[1], via: "drain" });
  }

  // const [head] = files; assert.equal(head, undefined) — destructuring takes the first element,
  // which is `undefined` on an empty subject. The binding rules below look for a derivation METHOD
  // and there is none here: the consumption is the pattern itself.
  const destr = new RegExp(String.raw`(?:const|let|var)\s+\[([^\]]*)\]\s*=\s*(${SUBJECT.source})\s*[;\n]`, "gu");
  for (const m of code.matchAll(destr)) {
    const names = [...m[1].matchAll(/[A-Za-z_$][\w$]*/gu)].map((x) => x[0]);
    if (!names.some((n) => mentionedInAssertion(code, n))) continue;
    if (names.some((n) => provenByName(code, n))) continue;
    found.push({ subject: m[2], via: "destructure" });
  }

  // while (!(r = it.next()).done) { ...assert... } — driving the iterator protocol by hand. The
  // subject is whatever `it` was taken from, and on an empty collection the first `next()` is
  // already `done`, so the body never runs. No loop rule above matches this condition shape.
  for (const m of code.matchAll(/while\s*\(/gu)) {
    const head = balancedParens(code, m.index + m[0].length - 1);
    if (head === null || !/\.next\s*\(\s*\)/u.test(head)) continue;
    const body = blockAt(code, m.index + m[0].length + head.length + 1);
    const driver = /([A-Za-z_$][\w$]*)\s*\.next\s*\(/u.exec(head);
    if (!driver || !isVerdict(body, driver[1])) continue;
    found.push({ subject: driver[1], via: "iterator" });
  }

  // if (S.some(p)) assert.fail(...) — the verdict lives in a branch that an empty S never enters.
  // `some` is exempt as a liveness proof exactly because it is false on an empty subject; guarding a
  // failure with it turns that falsity into a pass, the same inversion as `!S.some(p)`.
  for (const m of code.matchAll(/\bif\s*\(/gu)) {
    const head = balancedParens(code, m.index + m[0].length - 1);
    if (head === null) continue;
    const body = blockAt(code, m.index + m[0].length + head.length + 1);
    if (!bodyAsserts(code, body, imported)) continue;
    for (const d of head.matchAll(/(?:\?)?\.(?:some|find|filter|map|flatMap)\s*\(/gu)) {
      const recv = receiverBefore(head, d.index);
      if (recv !== "") {
        found.push({ subject: recv, via: "if-guard" });
        break;
      }
    }
  }

  // switch (S.filter(p).length) { case 0: break; default: assert.fail(); } — the derivation is in the
  // discriminant, so it is inside no assertion at all, and the verdict is a `default` branch.
  for (const m of code.matchAll(/\bswitch\s*\(/gu)) {
    const head = balancedParens(code, m.index + m[0].length - 1);
    if (head === null) continue;
    const body = blockAt(code, m.index + m[0].length + head.length + 1);
    if (!bodyAsserts(code, body, imported)) continue;
    for (const d of head.matchAll(/(?:\?)?\.(?:filter|map|flatMap)\s*\(/gu)) {
      const recv = receiverBefore(head, d.index);
      if (recv !== "") {
        found.push({ subject: recv, via: "switch" });
        break;
      }
    }
  }

  // assert.ok(S.every(p)) — vacuously true, and its subject is the receiver.
  // assert.ok(<chain>.every(p)) — vacuously true. The receiver is found by walking left rather than
  // by regex, because it may be a chain containing nested parentheses.
  for (const m of code.matchAll(/(?:\?)?\.every\s*\(/gu)) {
    const recv = receiverBefore(code, m.index);
    if (recv !== "") found.push({ subject: rootSubject(recv), via: "every" });
  }

  // A vacuity-prone derivation ANYWHERE inside a binding, whose bound name then reaches a verdict
  // that does not refute emptiness.
  //
  // The rule this replaces required the derivation to be the whole right-hand side and the name to
  // be a plain identifier, so three shapes walked past it: a wrapper around the derivation
  // (`new Set(files.filter(p))`, `new Map(files.map(p))`) and a destructuring binding
  // (`const [first] = files.filter(p)`). Neither the wrapper nor the binding pattern changes what
  // is being consumed, so neither should change whether it is examined.
  //
  // A binding whose name never reaches an assertion is data shaping, not a verdict, and is left
  // alone — the same distinction the loop rules make with `bodyAsserts`.
  const bindPat = /(?:const|let|var)\s+(\[[^\]]*\]|\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*/gu;
  for (const m of code.matchAll(bindPat)) {
    const expr = expressionAt(code, m.index + m[0].length);
    const names = /^[[{]/u.test(m[1]) ? [...m[1].matchAll(/[A-Za-z_$][\w$]*/gu)].map((x) => x[0]) : [m[1]];
    if (!names.some((n) => mentionedInAssertion(code, n))) continue;
    if (names.some((n) => provenByName(code, n))) continue;
    let hit = false;
    for (const d of expr.matchAll(/(?:\?)?\.(?:filter|map|flatMap|reduce)\s*\(/gu)) {
      const recv = receiverBefore(expr, d.index);
      if (recv !== "") {
        found.push({ subject: recv, via: "derived" });
        hit = true;
        break;
      }
    }
    // `const grouped = Object.groupBy(files, k)` derives through a static method, so there is no
    // receiver to walk back to and the loop above sees nothing.
    if (hit) continue;

    // `const bad = files.find(p); assert.equal(bad, undefined);`
    //
    // `find` is exempt as a LIVENESS proof because it is falsy on an empty subject — but that same
    // falsity is a passing verdict once the result is asserted ABSENT. This is the `negated-some`
    // inversion again, one binding further out. The derived value is an ELEMENT, not a collection,
    // so the exemption is presence: an assertion that the element is there cannot hold on an empty
    // subject, and anything else is treated as vacuity-prone.
    const fnd = /(?:\?)?\.find\s*\(/u.exec(expr);
    if (fnd) {
      const recv = receiverBefore(expr, fnd.index);
      if (recv !== "" && !names.some((n) => assertsPresence(code, n))) {
        found.push({ subject: recv, via: "find" });
        continue;
      }
    }

    const stat = /(?:Object[.](?:keys|values|entries|groupBy|fromEntries)|Array[.]from)\s*\(\s*([A-Za-z_$][\w$.]*)\s*[,)]/u.exec(expr);
    if (stat) found.push({ subject: stat[1], via: "derived" });
  }

  // ANY collection derived inside an assertion that does not refute emptiness.
  //
  // This replaces three sink-specific rules — `chained` (`.length, 0`), `counted` (a bound count
  // compared to zero) and `keys-empty` (`deepEqual(Object.keys(X), [])`) — and it exists because
  // enumerating sinks is a race the sink space wins. Two specimens escaped the first round on
  // `.join(",") === ""` and on a ternary, and neither is more exotic than the three that did not.
  // Asking instead which assertions REFUTE emptiness inverts the default: an unrecognised sink is
  // now flagged rather than allowed. See `assertion-shape.mjs` for the closed exemption set.
  const ungrounded = (recv) => !(/^[A-Za-z_$][\w$]*$/u.test(recv) && grounded.has(recv));
  for (const call of assertionCalls(code)) {
    if (refutesEmptiness(call, liveBase(code))) continue;
    for (const m of call.text.matchAll(/(?:\?)?\.(?:filter|map|flatMap|reduce)\s*\(/gu)) {
      const recv = receiverBefore(call.text, m.index);
      if (recv !== "" && ungrounded(recv)) found.push({ subject: recv, via: "derived-assert" });
    }
    // `groupBy` and `fromEntries` join `keys`/`values`/`entries`: each yields an empty result from an
    // empty input, so `assert.deepEqual(Object.groupBy(files, k), {})` is the same false green.
    for (const m of call.text.matchAll(/Object[.](?:keys|values|entries|groupBy|fromEntries)\s*\(\s*([A-Za-z_$][\w$.]*)\s*[,)]/gu)) {
      if (ungrounded(m[1])) found.push({ subject: m[1], via: "derived-assert" });
    }
  }

  // assert.ok(!S.some(p)) — the negation turns `some`'s emptiness-safety inside out. `some` is
  // exempt as a LIVENESS proof precisely because it is false on an empty subject; negated, that same
  // falsity becomes a pass. The exemption was mine, and this is the shape that defeats it.
  for (const m of code.matchAll(new RegExp("!" + String.raw`\s*(SUBJ)(?:\?)?\.(?:some|find)\s*\(`.replace("SUBJ", SUBJECT.source), "gu"))) {
    found.push({ subject: m[1], via: "negated-some" });
  }

  // const n = S.filter(p).length — the count is bound OUTSIDE any assertion, so the rule above
  // cannot see the derivation. Vacuity-prone unless some assertion mentioning `n` refutes emptiness.
  const counted = new RegExp(String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(SUBJ)\.(?:filter|map|flatMap)\s*\((?:[^()]|\([^()]*\))*\)\.length`.replace("SUBJ", SUBJECT.source), "gu");
  for (const m of code.matchAll(counted)) {
    if (!provenByName(code, m[1])) found.push({ subject: m[2], via: "counted" });
  }

  return found.map((c) => ({ ...c, subject: rootSubject(c.subject) }));
}

/** Every `const X = <expr>` in this file, as X -> expr. First binding wins. */
function bindings(code) {
  const out = new Map();
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/gu)) {
    if (!out.has(m[1])) out.set(m[1], expressionAt(code, m.index + m[0].length).trim());
  }
  return out;
}

/**
 * Names whose non-emptiness this file establishes, directly or by derivation from something it
 * establishes. The transitive step is what separates a verdict list from an unexamined subject:
 *
 *     assert.ok(RECORDS.length > 0);                     // RECORDS proven
 *     const model    = buildModel(RECORDS);              // grounded in RECORDS
 *     const findings = checkTracker(derive(model), T);   // grounded in model
 *     assert.deepEqual(findings.map(f => f.kind), []);   // an EMPTY findings is the success
 *
 * `findings` is the offenders list, not the subject. Requiring a proof that it has elements would
 * demand the tracker always disagree. The subject that had to be proven live is RECORDS, and it was.
 *
 * A bare `const x = discover()` grounds nothing, so it stays flagged — the distinction is whether
 * the value descends from something this file proved, not whether it came from a call.
 */
/** Names this file has directly established as non-empty, before any transitive reasoning. */
function liveBase(code) {
  const base = new Set([...livenessAssertions(code), ...livenessFromExpectation(code)]);
  for (const name of bindings(code).keys()) if (staticallyNonEmpty(code, name)) base.add(name);
  return base;
}

function groundedNames(code) {
  const grounded = liveBase(code);
  const bind = bindings(code);
  for (let pass = 0; pass < bind.size + 1; pass += 1) {
    let changed = false;
    for (const [name, expr] of bind) {
      if (grounded.has(name)) continue;
      for (const g of grounded) {
        if (new RegExp(String.raw`\b${g}\b`, "u").test(expr)) {
          grounded.add(name);
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
  return grounded;
}

/**
 * Follow a name back through emptiness-preserving bindings to the collection actually discovered, so
 * `missing` -> `probes` -> `ORACLE_TAGS` reports the tag list rather than the last alias of it.
 * Without this the same defect is reported once per intermediate name.
 */
export function resolveChain(code, text) {
  const bind = bindings(code);
  const seen = new Set();
  const chain = [rootSubject(text)];
  let cur = chain[0];
  while (/^[A-Za-z_$][\w$]*$/u.test(cur) && bind.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const next = rootSubject(bind.get(cur));
    if (next === cur) break;
    // Stop at a literal. `staticallyNonEmpty` reasons about NAMES, so resolving `CASES` to the text
    // of its own table would defeat that exemption and re-flag every table-driven test in the suite
    // — the first round's defect 1, arriving by a new route.
    if (/^[[{]/u.test(next)) break;
    chain.push(next);
    cur = next;
  }
  return chain;
}

/**
 * Does any assertion mentioning `name` refute its emptiness? This is the name-bound counterpart of
 * the fail-closed rule in `consumptions`: a derived collection given a name is proven only if some
 * assertion about that name could not hold when it is empty.
 */
/**
 * Does this file assert that `name` is PRESENT? Used only for a `find` result, where the vacuous
 * shape is asserting absence and the honest one is asserting the element is there.
 */
function assertsPresence(code, name) {
  const word = new RegExp(String.raw`\b${name}\b`, "u");
  const negated = new RegExp(String.raw`!\s*${name}\b`, "u");
  for (const call of assertionCalls(code)) {
    const a0 = call.args[0] ?? "";
    if (!word.test(a0) || negated.test(a0)) continue;
    if (call.name === "fail") continue; // an unconditional failure; its argument is a message
    if (call.args.length === 1 || call.name === "ok" || call.name === "assert" || call.name === "match") return true;
    const expected = (call.args[1] ?? "").trim();
    if (expected !== "undefined" && expected !== "null" && expected !== "false") return true;
  }
  return false;
}

/**
 * Does this name reach a verdict at all? A binding that does not is data shaping, not a verdict.
 *
 * A `throw` counts alongside an assertion. `const bad = files.filter(p); if (bad.length) throw ...`
 * contains no assertion anywhere, and demanding one let the whole throwing dialect past the binding
 * rules exactly as it once did past the loop rules.
 */
function mentionedInAssertion(code, name) {
  const word = new RegExp(String.raw`\b${name}\b`, "u");
  if (assertionCalls(code).some((call) => word.test(call.text))) return true;
  for (const m of code.matchAll(/\bthrow\b/gu)) {
    const stmt = code.slice(Math.max(0, m.index - 160), m.index + 160);
    if (word.test(stmt)) return true;
  }
  return false;
}

function provenByName(code, name) {
  const word = new RegExp(String.raw`\b${name}\b`, "u");
  for (const call of assertionCalls(code)) {
    if (word.test(call.text) && refutesEmptiness(call, liveBase(code))) return true;
  }
  return false;
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
  // The subject may be the literal itself rather than a name for one: `[a, b].filter(p)` consumes a
  // two-element array written in place. A LEADING spread is excluded, because `[...PASSING]` is
  // empty exactly when `PASSING` is and the question simply moves to that name.
  const lit = /^\[([\s\S]*)\]$/u.exec(subject.trim());
  if (lit) {
    const parts = splitTopLevel(lit[1]).filter((x) => x !== "");
    if (parts.some((x) => !x.startsWith("..."))) return true;
  }

  const name = unwrap(subject);
  if (name === null) return false;
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([[{])/gu)) {
    if (m[1] !== name) continue;
    const open = m.index + m[0].length - 1;
    const body = balanced(code, open, m[2], m[2] === "[" ? "]" : "}");
    // A leading spread is not static content: `const queue = [...files]` has a non-empty literal
    // body and is still empty whenever `files` is, so treating it as proven let a drain loop pass.
    if (body.trim().startsWith("...")) return false;
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
export function vacuousSubjects(code, imported = new Set()) {
  const out = [];
  for (const c of consumptions(code, imported)) {
    // Liveness is tested at EVERY link of the chain, not only at its end. `SOURCES` is bound from
    // `readdirSync(DOCS).filter(...).sort()` and proven by `assert.ok(SOURCES.length >= 2)`; walking
    // past that name to `readdirSync(DOCS)` and asking about liveness there flagged an honest test
    // whose proof was four lines above the loop.
    const chain = resolveChain(code, c.subject);
    if (chain.some((s) => staticallyNonEmpty(code, s) || provenLive(code, s))) continue;
    out.push(`${chain[chain.length - 1]} (${c.via})`);
  }
  return [...new Set(out)].sort();
}
