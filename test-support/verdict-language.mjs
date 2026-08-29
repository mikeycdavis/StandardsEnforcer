/**
 * ST-16, third round. The premise the liveness mechanism rests on, made checkable.
 *
 * WHAT THIS IS FOR. `subject-liveness.mjs` reads verdicts written in one dialect: the identifier
 * `assert`, bound to `node:assert/strict`, plus `throw`. That is not a claim about JavaScript; it is
 * a claim about THIS repository. Round two recorded one shape it could not read —
 * `expect(f).toBeTruthy()` — and guarded the premise with a test that every surface file imports
 * `node:assert`. That guard is too weak in a specific way: a file may import `node:assert` AND reach
 * its verdict through something else entirely, and it passes.
 *
 * So the guard asked the wrong question. "Does this file use the dialect?" admits a file that uses
 * the dialect AND something else. The question that closes is "can this file reach a verdict through
 * anything the mechanism cannot read?" — and that one is answerable, because the answer is bounded
 * by the file's own bindings.
 *
 * THE CLOSURE ARGUMENT. A verdict is reached by calling something. Every call in a module has a root
 * identifier, and that identifier is one of exactly four things:
 *
 *   1. bound by an import          — and every import specifier here is `node:*` or relative,
 *                                    both of which are readable, so the callee is resolvable
 *   2. bound in the file           — a declaration, a parameter, a destructuring; resolvable
 *   3. a global the LANGUAGE defines — a closed set, fixed by ECMAScript and the Node runtime
 *   4. free                        — bound by nothing this module can see
 *
 * Case 4 is where a foreign assertion library lives, whether injected as a global by a test runner
 * or imported from a package. Cases 1–3 are enumerable and this module enumerates them, so the
 * residue is not "everything else in JavaScript" — it is a list this module can print.
 *
 * That is what makes the claim CLOSED rather than another enumeration of shapes. It does not require
 * knowing what `expect` does. It requires only noticing that `expect` is not anything this file
 * accounts for, and refusing to certify a file whose verdict language it cannot read.
 *
 * FAIL CLOSED, NOT "NOT APPLICABLE". An unsupported file is an OFFENDER, not a skip. A mechanism
 * that quietly declines to analyse what it cannot read reports success over an unexamined subject,
 * which is INV-E1's own defect committed by the guard that exists to reject it. Every function here
 * returns reasons to reject; none returns an exemption.
 */

/**
 * The globals a call may root at without being free. Closed because ECMAScript and Node close it —
 * this is not an alias list that the next spelling defeats, it is the language's own vocabulary. A
 * global outside this set is reported rather than allowed, so a runner-injected `expect`, `describe`
 * or `chai` is a rejection and not a silent pass.
 *
 * Deliberately NOT included: `require`, `eval`, `Function`, `globalThis`, `process`. Each is a way to
 * reach a name this module cannot follow, so a file using one to call something is exactly a file
 * whose verdict language is not readable. `process` is admitted only where it is bound by an import.
 */
import { assertEscapes } from "./helper-attribution.mjs";

export const LANGUAGE_GLOBALS = new Set([
  "Array", "ArrayBuffer", "BigInt", "Boolean", "Buffer", "DataView", "Date", "Error", "EvalError",
  "Infinity", "Intl", "JSON", "Map", "Math", "NaN", "Number", "Object", "Promise", "Proxy",
  "RangeError", "ReferenceError", "Reflect", "RegExp", "Set", "String", "Symbol", "SyntaxError",
  "TextDecoder", "TextEncoder", "TypeError", "URIError", "URL", "URLSearchParams", "WeakMap",
  "WeakRef", "WeakSet", "atob", "btoa", "clearInterval", "clearTimeout", "decodeURI",
  "decodeURIComponent", "encodeURI", "encodeURIComponent", "isFinite", "isNaN", "parseFloat",
  "parseInt", "queueMicrotask", "setInterval", "setTimeout", "structuredClone", "undefined",
]);

/** Reserved words that begin a call-shaped construct without being a callee. */
const KEYWORD = new Set([
  "if", "for", "while", "switch", "catch", "return", "function", "await", "new", "typeof", "else",
  "do", "try", "throw", "of", "in", "const", "let", "var", "case", "default", "delete", "void",
  "yield", "async", "import", "export", "class", "extends", "instanceof", "super", "this", "null",
  "true", "false", "with", "debugger", "static", "get", "set",
]);

/** Every identifier in a binding pattern — `{ a, b: c, d = 1, ...rest }` and `[x, , y]` alike. */
function patternNames(text) {
  const out = [];
  for (const piece of text.split(",")) {
    const trimmed = piece.trim().replace(/^\.\.\./u, "");
    if (trimmed === "") continue;
    // `{ a: b }` binds b, `a = 1` binds a. Take the segment after a colon, before an equals.
    const afterColon = trimmed.includes(":") ? trimmed.slice(trimmed.lastIndexOf(":") + 1) : trimmed;
    const id = afterColon.split("=")[0].trim();
    if (/^[A-Za-z_$][\w$]*$/u.test(id) && !KEYWORD.has(id)) out.push(id);
  }
  return out;
}

/**
 * Every name bound anywhere in this module.
 *
 * Deliberately scope-blind: a name bound in any function counts as bound everywhere. That direction
 * is safe here. Over-collecting bindings can only make a callee look accounted-for that is really
 * out of scope, which is a false NEGATIVE for a shadowing bug this module is not looking for;
 * under-collecting would flag honest files, which is the failure that makes a discriminator worse
 * than none. Parameter destructuring is included because four honest surface files bind their
 * helpers that way — `(_records, { add }) => add(...)` — and omitting it reported all four as free.
 */
export function bindings(code) {
  const bound = new Set();
  const add = (name) => { if (/^[A-Za-z_$][\w$]*$/u.test(name) && !KEYWORD.has(name)) bound.add(name); };

  for (const m of code.matchAll(/^\s*import\s+([\s\S]*?)\s+from\s+["'][^"']*["']/gmu)) {
    for (const clause of m[1].replace(/[{}]/gu, " ").split(",")) {
      add(clause.trim().split(/\s+as\s+/u).pop().trim());
    }
  }
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gu)) add(m[1]);
  for (const m of code.matchAll(/(?:function|class)\s*\*?\s*([A-Za-z_$][\w$]*)/gu)) add(m[1]);
  for (const m of code.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/gu)) add(m[1]);
  // A destructuring binding, whether it is initialised with `=` or by a for-of/for-in head. Omitting
  // the loop head reported `corrupt`, `expected` and `exits` as free callees in three honest files,
  // each of which binds its helper as `for (const [label, corrupt] of ...)`.
  //
  // The pattern body excludes `;` so it cannot span a statement boundary. With `[\s\S]*?` a
  // `const {` whose own match failed went on expanding across the rest of the file and swallowed
  // every later destructuring with it — the three files above stayed flagged after the loop-head
  // case was added, because their bindings had been eaten by an earlier one.
  for (const m of code.matchAll(/(?:const|let|var)\s*([[{][^;]*?[\]}])\s*(?:=[^=]|\bof\b|\bin\b)/gu)) {
    for (const n of patternNames(m[1].slice(1, -1))) add(n);
  }
  // Parameter lists: `(a, { b }) =>`, `function f(a, [b])`, and object/class shorthand `m(a) {`.
  for (const m of code.matchAll(/\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(?:=>|\{)/gu)) {
    let depth = 0;
    let start = 0;
    const params = m[1];
    for (let i = 0; i <= params.length; i += 1) {
      const c = params[i];
      if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") depth -= 1;
      if (i === params.length || (c === "," && depth === 0)) {
        const p = params.slice(start, i).trim();
        start = i + 1;
        if (p.startsWith("{") || p.startsWith("[")) for (const n of patternNames(p.slice(1, -1))) add(n);
        else add(p.replace(/^\.\.\./u, "").split("=")[0].trim());
      }
    }
  }
  return bound;
}

/** Every `import` in the module, as `{ clause, spec }`, read from RAW source. */
export function imports(raw) {
  const out = [];
  for (const m of raw.matchAll(/^\s*import\s+(?:([\s\S]*?)\s+from\s+)?["']([^"']+)["']/gmu)) {
    out.push({ clause: (m[1] ?? "").trim(), spec: m[2] });
  }
  return out;
}

/**
 * Every call site's root identifier, as `{ name, index }`.
 *
 * The root is only a root when nothing binds it leftwards. `x\n  .join(",")` and `/re/u.test(s)`
 * both present an identifier immediately before a parenthesis, and reading either as a root reported
 * thirty-three method names as free identifiers on a surface that has none. The preceding
 * non-whitespace character settles it: `.` means a method, `/` means a regex flag, a word character
 * means the tail of a longer name.
 */
/** The index of the parenthesis matching the one at `open`, or -1 if unbalanced. */
function closeParen(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === "(") depth += 1;
    else if (code[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function callRoots(code) {
  const out = [];
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)(?:\s*\.\s*[\w$]+)*\s*\(/gu)) {
    const before = code.slice(0, m.index).replace(/\s+$/u, "").slice(-1);
    if (before === "." || before === "/" || /[\w$]/u.test(before)) continue;
    if (KEYWORD.has(m[1])) continue;
    // `requiredChecks() { ... }` in an object literal is a method DEFINITION, not a call. The two
    // are distinguished by what follows the closing parenthesis: a body brace means a definition,
    // and reading one as a call reported an honest test double's method as an unaccounted callee.
    const close = closeParen(code, m.index + m[0].length - 1);
    if (close !== -1 && code.slice(close + 1).trimStart().startsWith("{")) continue;
    out.push({ name: m[1], index: m.index });
  }
  return out;
}

/**
 * Why this file's verdict language cannot be read, as a list of reasons. Empty means supported.
 *
 * Takes RAW source, not stripped: `stripComments(code, { strings: true })` blanks the contents of
 * string literals, and an import specifier IS a string literal. Reading `"node:assert/strict"` from
 * stripped source gets `"                  "`, so every dialect claim would be made against blanks.
 * The call scan runs on stripped code, supplied separately, so a specimen held as data in a string
 * cannot manufacture a rejection.
 */
export function unsupportedReasons(raw, stripped) {
  const reasons = [];
  const seen = imports(raw);

  const assertImports = seen.filter((i) => /^node:assert(?:\/strict)?$/u.test(i.spec));
  if (assertImports.length === 0) {
    reasons.push("no-assert-import: the mechanism reads verdicts written with node:assert, and this file imports none");
  }
  for (const i of assertImports) {
    if (i.spec !== "node:assert/strict") {
      reasons.push(`assert-dialect: imports ${i.spec}, not node:assert/strict, so equality is loose where the mechanism assumes strict`);
    }
    if (i.clause !== "assert") {
      reasons.push(`assert-binding: node:assert is bound as \`${i.clause}\`, and every rule in the mechanism matches the identifier \`assert\``);
    }
  }
  for (const i of seen) {
    if (!i.spec.startsWith("node:") && !i.spec.startsWith(".")) {
      reasons.push(`foreign-module: imports "${i.spec}", whose verdicts are written in a dialect this mechanism cannot read`);
    }
  }

  // `assert` may appear as a CALLEE and nowhere else. Anywhere else — `const eq = assert.equal`,
  // `run(assert, files)`, `new Proxy(assert, {})`, `assert.ok.bind(assert)` — the verdict becomes
  // reachable through a name this file never writes, and every rule that matches the identifier
  // `assert` stops seeing it.
  //
  // Stated as an inversion rather than a list of aliasing spellings, which is the same correction
  // `assertion-shape.mjs` made to the sink rules. The enumerated form caught two of round eleven's
  // twenty shapes; this catches those and the value-position ones without naming any of them.
  for (const use of assertEscapes(stripped)) {
    reasons.push(`assert-escapes: \`assert\` is used as a value rather than as a callee in \`${use}\`, so a verdict can be reached through a name no rule here matches`);
  }

  const bound = bindings(stripped);
  const free = new Set();
  for (const { name } of callRoots(stripped)) {
    if (bound.has(name) || LANGUAGE_GLOBALS.has(name)) continue;
    free.add(name);
  }
  for (const name of [...free].sort()) {
    reasons.push(`free-callee: \`${name}()\` is bound by no import, declaration or parameter in this file, and is not a language global — so what it does, and whether it is a verdict, cannot be read`);
  }
  return reasons;
}

/**
 * The source text bound to `name` by this module's exports, or null if the module does not export it.
 *
 * The export forms are enumerated because ECMAScript enumerates them — `function`, `const`/`let`/
 * `var`, `class`, a bare `export { ... }` list naming a local declaration, and a re-export
 * `export { ... } from "./other"`. Measured against the surface: 164 of 170 imported names resolved
 * through the first two forms alone, and every one of the remaining six was a class, a bare list, or
 * a re-export. Returning null is the FAIL-CLOSED answer, and the caller reports it rather than
 * assuming the name is inert.
 *
 * A module is `{ raw, src, path }`: `raw` for reading IMPORT SPECIFIERS, which are string
 * literals and therefore blanked to spaces in `src`, and `src` for reading declaration BODIES,
 * where a specimen held in a string must not be mistaken for code. Reading specifiers from `src`
 * matched no import at all and reported the whole surface as having nothing to resolve.
 *
 * `load(spec, fromPath)` reads a relative module RELATIVE TO THE MODULE DOING THE RE-EXPORT and
 * recurses, so a re-export is chased to the declaration that actually has a body. Resolving the
 * specifier against the importing TEST file instead reported `receiverBefore` — re-exported by
 * subject-liveness.mjs from ./assertion-shape.mjs — as unresolvable. `seen` bounds the descent,
 * because a module cycle would otherwise be an infinite recursion in a guard whose whole purpose
 * is to terminate with an answer.
 */
export function exportedBody(mod, name, { load = null, seen = new Set() } = {}) {
  const src = mod.src;
  const fn = new RegExp(String.raw`export\s+(?:async\s+)?function\s*\*?\s*${name}\s*\(`, "u").exec(src);
  if (fn) return src.slice(fn.index, blockEnd(src, fn.index));
  const decl = new RegExp(String.raw`export\s+(?:const|let|var|class)\s+${name}\b`, "u").exec(src);
  if (decl) return src.slice(decl.index, blockEnd(src, decl.index));

  for (const m of src.matchAll(/export\s*\{([^}]*)\}(?:\s*from\s*["']([^"']+)["'])?/gu)) {
    const hit = m[1].split(",").map((c) => {
      const [local, exported] = c.split(/\s+as\s+/u).map((x) => x.trim());
      return { local, exported: exported ?? local };
    }).find((n) => n.exported === name);
    if (!hit) continue;
    if (m[2]) return hop(mod, m[2], hit.local, load, seen);

    // A bare list re-exports either a declaration in this module or a name it imported. Following
    // the second is what `export { receiverBefore };` in subject-liveness.mjs needs: the declaration
    // is in assertion-shape.mjs, and stopping at "no local declaration" reported an honest re-export
    // as unresolvable.
    const local = new RegExp(String.raw`(?:async\s+)?(?:function\s*\*|const|let|var|class)\s+${hit.local}\b`, "u").exec(src);
    if (local) return src.slice(local.index, blockEnd(src, local.index));
    for (const imp of imports(mod.raw)) {
      if (!imp.spec.startsWith(".")) continue;
      const named = imp.clause.replace(/[{}]/gu, " ").split(",").map((c) => c.trim()).filter(Boolean)
        .map((c) => c.split(/\s+as\s+/u).map((x) => x.trim()))
        .find(([exported, alias]) => (alias ?? exported) === hit.local);
      if (named) return hop(mod, imp.spec, named[0], load, seen);
    }
    return null;
  }
  return null;
}

/** Load `spec` relative to `mod` and continue the search for `name` there. */
function hop(mod, spec, name, load, seen) {
  if (!load) return null;
  const next = load(spec, mod.path);
  if (next === null || seen.has(next.path)) return null;
  return exportedBody(next, name, { load, seen: new Set([...seen, mod.path]) });
}

/** The end of the declaration starting at `from`: the close of its first brace block, else its line. */
function blockEnd(src, from) {
  const open = src.indexOf("{", from);
  const semi = src.indexOf(";", from);
  if (open === -1 || (semi !== -1 && semi < open)) return semi === -1 ? src.length : semi;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

/** Does this declaration's text reach a verdict — an assertion or a throw? */
export const reachesVerdict = (text) => /assert\s*[.(]/u.test(text) || /\bthrow\b/u.test(text);

/**
 * Names this file imports from repository modules whose definitions reach a verdict, plus the names
 * it imports that could not be resolved at all.
 *
 * This is the half of the closure that RECOGNISES rather than rejects. A wrapper defined in the file
 * is already followed by `assertingHelpers`; a wrapper imported from a sibling module was not, so
 * `for (const f of files) checkFile(f);` reached a verdict the liveness mechanism could not see and
 * its subject was never questioned. Resolution keeps that shape readable instead of making every
 * file that imports anything unsupported — which, on a surface where all 36 files import repository
 * modules, is the only alternative.
 *
 * `node:` builtins are deliberately NOT resolved and NOT verdict-reaching. That is a premise, not an
 * oversight: `fs.readFileSync` throwing on a missing path is an environment failure, and treating it
 * as an assurance verdict would make every teardown loop in the suite a false positive. The premise
 * is bounded by `unsupportedReasons` rejecting any specifier that is neither `node:` nor relative.
 */
export function verdictReachingImports(mod, { load }) {
  const names = new Set();
  const unresolved = [];
  for (const i of imports(mod.raw)) {
    if (!i.spec.startsWith(".")) continue;
    const target = load(i.spec, mod.path);
    if (target === null) {
      unresolved.push(`unreadable-module: "${i.spec}" cannot be read, so whether the names it exports reach a verdict is unknown`);
      continue;
    }
    for (const clause of i.clause.replace(/[{}]/gu, " ").split(",").map((c) => c.trim()).filter(Boolean)) {
      const [exported, local] = clause.split(/\s+as\s+/u).map((x) => x.trim());
      if (exported === "*") continue;
      const body = exportedBody(target, exported, { load });
      if (body === null) {
        unresolved.push(`unresolved-import: \`${exported}\` is imported from "${i.spec}" but no export of that name was found there, so whether calling it reaches a verdict is unknown`);
        continue;
      }
      if (reachesVerdict(body)) names.add(local ?? exported);
    }
  }
  return { names, unresolved };
}
