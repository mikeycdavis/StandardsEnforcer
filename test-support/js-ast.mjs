/**
 * ST-16. The parse, and the walk. Everything the liveness analysis knows about JavaScript arrives
 * through this file.
 *
 * WHY THIS EXISTS AT ALL. Until ADR 0010 this repository read JavaScript with regular expressions.
 * Eighteen adversarial rounds were run against that reader. Rounds two, eleven, twelve and fourteen
 * each had ONE dominant fault, and each was closed by inverting a default. Round eighteen had no
 * dominant fault: twelve escapes spread evenly across all three grammars the reader had — flow,
 * subject, consumption — and the plainest of them was `for (const f of (files))`, which is ordinary
 * JavaScript that a parser handles for nothing and a regular expression cannot express at all.
 *
 * Extending three grammars in step is not a smaller job than parsing, and it does not converge.
 *
 * WHAT A PARSER BUYS, AND IT IS NOT SUBTLE. Acorn discards the shapes that are notation rather than
 * meaning, before the analysis sees them:
 *
 *     for (const f of (files))          ParenthesizedExpression is not produced without
 *                                       `preserveParens`, so the subject IS `files`
 *     for (const f of (0, files))       SequenceExpression, whose value is its last expression
 *     for (const f of await load())     AwaitExpression, one `.argument` away from the call
 *     Array.from(new Set(files))        two nested calls, which nests exactly as deeply as it reads
 *
 * None of those is a rule this repository now maintains. They are consequences of reading the
 * program rather than the text of it, which is the whole reason the dependency was taken.
 *
 * FAILING TO PARSE IS NOT A SKIP. `Unparseable` is thrown, never swallowed, and the caller turns it
 * into UNSUPPORTED — an offender. A file this mechanism cannot read is a file whose verdicts it
 * cannot vouch for, and treating that as "not applicable" would be this guard committing INV-E1's
 * defect in the one place it exists to reject it.
 */

import * as acorn from "acorn";

/** A file the mechanism could not read. Carries the parser's own reason and position. */
export class Unparseable extends Error {
  constructor(reason) {
    super(reason);
    this.name = "Unparseable";
  }
}

/**
 * Parse a module of this repository's dialect.
 *
 * `allowReturnOutsideFunction` is on because three specimens in `fixtures/subject-liveness/caught/`
 * are bare top-level `return` — deliberately, to probe the reader — and refusing them would make the
 * corpus unreadable rather than the specimens unsupported. `allowHashBang` because a script in
 * `scripts/` may carry one. Neither loosens what the analysis concludes; both only decide whether
 * there is a tree to analyse.
 *
 * The input is expected to have been through `stripComments(code, { strings: true })`, which blanks
 * string CONTENTS while preserving the quotes and the length. That keeps the source parseable and
 * keeps every node offset equal to an offset in the original file.
 */
export function parseModule(code) {
  try {
    return acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowHashBang: true,
      ranges: true,
    });
  } catch (err) {
    const at = typeof err.loc?.line === "number" ? ` at line ${err.loc.line}` : "";
    throw new Unparseable(`the file is not parseable JavaScript${at}: ${err.message}`);
  }
}

/**
 * Every node in the tree, parents first. `visit(node, parent)` returning `false` prunes that
 * subtree; anything else continues into it.
 *
 * Deliberately generic — it enumerates object-valued properties rather than a table of node types
 * per kind. A table is the same enumeration failure that defeated the regular expressions, one level
 * up: the ECMAScript grammar keeps acquiring node types, and a walker that lists them silently stops
 * descending into whatever it has not heard of. Enumerating properties cannot fall behind.
 */
export function walk(root, visit) {
  const seen = new Set();
  const stack = [[root, null]];
  while (stack.length > 0) {
    const [node, parent] = stack.pop();
    if (node === null || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) stack.push([child, parent]);
      continue;
    }
    if (typeof node.type !== "string") continue;
    if (visit(node, parent) === false) continue;
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end" || key === "range" || key === "loc") continue;
      const child = node[key];
      if (child !== null && typeof child === "object") stack.push([child, node]);
    }
  }
}

/** The source text a node spans. */
export const textOf = (code, node) => code.slice(node.start, node.end);

/** Does any node in this subtree satisfy `pred`? */
export function contains(root, pred) {
  let hit = false;
  walk(root, (n) => {
    if (hit) return false;
    if (pred(n)) hit = true;
    return !hit;
  });
  return hit;
}

/**
 * The dotted name a callee spells, or null if it is not a plain path.
 * `Array.prototype.every.call` -> "Array.prototype.every.call"; `reg["c"]` -> null.
 */
export function staticPath(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    const head = staticPath(node.object);
    return head === null ? null : `${head}.${node.property.name}`;
  }
  return null;
}

/**
 * The innermost object a member/call chain is rooted at — the name whose value the whole expression
 * is reaching into. `h.chk(f)` -> the Identifier `h`; `reg["c"](f)` -> the Identifier `reg`.
 *
 * This is what makes a computed key no different from a named one. Round eighteen's
 * `computed-key-assign` escaped because a subscript "has no segment to bind"; asking for the ROOT
 * rather than the last segment makes the question the same in both spellings.
 */
export function rootObject(node) {
  let cur = node;
  for (;;) {
    if (cur?.type === "MemberExpression") cur = cur.object;
    else if (cur?.type === "CallExpression" || cur?.type === "NewExpression") cur = cur.callee;
    else if (cur?.type === "ChainExpression") cur = cur.expression;
    else if (cur?.type === "TaggedTemplateExpression") cur = cur.tag;
    else return cur ?? null;
  }
}

/** Every Identifier a binding pattern introduces. `[a, b]`, `{ x: { y } }`, `...rest` — all of it. */
export function patternNames(pattern) {
  const names = [];
  walk(pattern, (n, parent) => {
    if (n.type !== "Identifier") return true;
    // A non-computed member key is a label, not a binding: `{ x: y }` binds `y`, never `x`.
    if (parent?.type === "Property" && parent.key === n && !parent.computed) return true;
    if (parent?.type === "MemberExpression" && parent.property === n && !parent.computed) return true;
    names.push(n.name);
    return true;
  });
  return names;
}
