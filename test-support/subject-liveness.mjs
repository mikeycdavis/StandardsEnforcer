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
 * ── THIS FILE READS A PARSE TREE. WHAT THAT DID AND DID NOT REPLACE. ──────────────────────────────
 *
 * Rounds one to eighteen read source with regular expressions. Round eighteen's finding was not its
 * escape count but its SHAPE: twelve escapes spread evenly across all three grammars this file had —
 * flow, subject, consumption — where every earlier round had one dominant fault closable by
 * inverting a default. `for (const f of (files))` is ordinary JavaScript a parser handles for
 * nothing. Extending three grammars in step does not converge. ADR 0010 records the dependency that
 * followed and what it cost.
 *
 * Three grammars were replaced. One was NOT:
 *
 *   REPLACED  the CONSUMPTION grammar — which syntactic forms iterate a collection
 *   REPLACED  the SUBJECT grammar — which expression is the collection being iterated
 *   REPLACED  the FLOW analysis — whether a name can carry a verdict to the point of consumption
 *   KEPT      the ASSERTION grammar — `assertion-shape.mjs` and `verdict-liveness.mjs`, unchanged
 *
 * The assertion side is kept deliberately rather than left undone. It reads a closed vocabulary of
 * ten `assert.*` forms that the surface is checked against in both directions, and it is built on an
 * INVERSION — an assertion is vacuity-prone unless it demonstrably refutes emptiness — so an
 * unrecognised form fails closed. That is the structure the three replaced grammars lacked, and it
 * is why they lost and this has not.
 *
 * ── WHAT COUNTS AS VACUITY-PRONE ─────────────────────────────────────────────────────────────────
 *
 * Only consumptions whose success survives an empty subject:
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
 * a loop whose body actually reaches a verdict is treated as verdict-bearing. Without that, every
 * data-shaping loop in the suite would demand a liveness proof it has no business making.
 *
 * AN UNPARSEABLE FILE IS AN OFFENDER, NEVER A SKIP. `parseModule` throws `Unparseable` and nothing
 * here catches it. A file this mechanism cannot read is one whose verdicts it cannot vouch for, and
 * calling that "not applicable" would be this guard committing INV-E1's defect in the single place
 * it exists to reject it.
 */

import { livenessAssertions } from "./verdict-liveness.mjs";
import { assertionCalls, refutesEmptiness, receiverBefore, splitTopLevel } from "./assertion-shape.mjs";
import { verdictBearingNames } from "./helper-attribution.mjs";
import { parseModule, walk, textOf, contains, staticPath, rootObject, patternNames, Unparseable } from "./js-ast.mjs";

export { receiverBefore, Unparseable };

/** Methods whose result is satisfied by an empty receiver. See the note above on `some`/`find`. */
export const VACUOUS_METHODS = ["filter", "map", "flatMap", "every", "forEach"];

/**
 * Every method that hands each element to a CALLBACK. Wider than the set whose RESULT is
 * emptiness-safe, and deliberately so — round twenty-two found three escapes that turned on
 * confusing the two:
 *
 *     files.some((f) => { assert.ok(ok(f)); return false; });
 *
 * `some` is exempt as a liveness PROOF because its result is falsy on an empty subject. Its callback
 * is not exempt from anything: it runs once per element, so on an empty subject it never runs and
 * the assertion inside it is never made. The exemption was about the result and had been applied to
 * the iteration, which is a different claim.
 */
const CALLBACK_METHODS = new Set([
  "forEach", "map", "filter", "flatMap", "every", "some", "find", "findIndex", "findLast",
  "findLastIndex", "reduce", "reduceRight", "sort", "toSorted", "group", "groupBy", "partition",
]);

/** ...and, of those, the ones that ITERATE rather than yield a collection to be asserted about. */
const ITERATING_METHODS = new Set(["forEach", "every", "map", "flatMap", "filter", "reduce", "sort"]);

/**
 * Transforms that carry emptiness through unchanged, so the liveness question lands on the
 * collection actually discovered. `files.map(p).filter(q)` is empty exactly when `files` is.
 */
const PRESERVING = new Set(["map", "filter", "flat", "flatMap", "entries", "sort", "slice", "concat", "reverse"]);

/** Calls and constructors that copy a collection without changing whether it has elements. */
const COPYING = new Set(["Array.from", "Object.freeze", "Set", "Map", "Array.of", "Promise.all", "Promise.allSettled"]);

/** Container mutations that put a value somewhere it can be reached from later. */
const MUTATORS = new Set(["push", "unshift", "add", "set", "splice", "concat"]);

/**
 * Statics that WRITE INTO their first argument. `Object.assign(reg, { chk })` and
 * `Object.defineProperty(reg, "c", { value: chk })` put a checker into `reg` exactly as `reg.c = chk`
 * does, and the container was bound before the checker arrived, so nothing about its binding says
 * so. The receiver has simply moved out of receiver position — the same relocation `.call` performs
 * on a subject, and handled the same way. Found by round nineteen.
 */
const WRITES_INTO_FIRST_ARGUMENT = new Set([
  "Object.assign", "Object.defineProperty", "Object.defineProperties", "Reflect.set", "Reflect.defineProperty",
]);

/**
 * The property name a member access reads, whichever way it was spelled. `files["forEach"]` and
 * `files.forEach` are the same access — round twenty-three escaped through the first, which means
 * reading only the second had been a grammar rule in disguise. Returns null for a genuinely dynamic
 * key, where the name is unknowable and claiming one would be the opposite of failing closed.
 */
function namedProperty(node) {
  if (node?.type !== "MemberExpression") return null;
  if (!node.computed) return node.property.type === "Identifier" ? node.property.name : null;
  return node.property.type === "Literal" && typeof node.property.value === "string" ? node.property.value : null;
}

/** A key blanked to whitespace by `stripComments(code, { strings: true })`, or empty. */
const UNREADABLE_KEY = (key) => key.trim() === "";

/** Receivers that are namespaces rather than collections: their methods take the subject as an argument. */
const STATIC_NAMESPACES = new Set(["Object", "Reflect", "Array", "Math", "JSON", "Promise"]);

// ── the tree, and what the analysis reads out of it ───────────────────────────────────────────────

/**
 * Everything one file's tree is asked. Built once per call: the taint closure below needs several
 * passes, and re-walking the tree per pass is the only cost that would make a parser slower than the
 * regular expressions it replaced.
 */
const MODELS = new Map();

// The tree is built once per source string. Several helpers below need it, and re-parsing per
// helper is the one cost that would make reading a tree slower than matching text.
function model(code, imported) {
  const hit = MODELS.get(code);
  if (hit !== undefined) return { ...hit, imported };
  if (MODELS.size > 64) MODELS.clear();
  const built = buildModel(code, imported);
  MODELS.set(code, built);
  return built;
}

function buildModel(code, imported) {
  const ast = parseModule(code);

  const nodes = [];
  const parents = new Map();
  walk(ast, (n, parent) => {
    nodes.push(n);
    parents.set(n, parent);
    return true;
  });

  /** Is this node an assertion call — `assert(...)`, `assert.ok(...)`, `assert.deepEqual(...)`? */
  const isAssertCall = (n) => {
    if (n.type !== "CallExpression") return false;
    const root = rootObject(n.callee);
    if (root?.type === "Identifier" && root.name === "assert") return true;
    // `t.assert.ok(...)`, `chai.assert.ok(...)` — the dialect is named by a SEGMENT of the callee
    // path, not by its root. A test runner that hands its own assert in as `t.assert` is an ordinary
    // idiom, and reading only the root made it invisible.
    const path = staticPath(n.callee);
    return path !== null && path.split(".").includes("assert");
  };

  /** Does this subtree reach a verdict on its own — by asserting, or by throwing? */
  const reachesVerdict = (n) => contains(n, (x) => isAssertCall(x) || x.type === "ThrowStatement");

  return { ast, code, nodes, parents, isAssertCall, reachesVerdict, imported };
}

/**
 * The names whose value can carry a verdict to wherever it is called.
 *
 * ROUND FIFTEEN'S INVERSION, NOW STRUCTURAL. The set of ways a value can travel is open; the set of
 * ways it stops is closed and has one member — being CALLED, whose result is data rather than the
 * checker. That was expressed against source text and lost to five ordinary spellings in round
 * eighteen. Against a tree it is one predicate, and those five spellings are the same event:
 *
 *     const chk = (f) => assert.ok(f)     a declaration                     binds `chk`
 *     reg["c"] = chk                      assignment through a computed key binds the ROOT, `reg`
 *     [a, b] = [b, a]                     destructuring ASSIGNMENT          binds every pattern name
 *     cs.push(chk) / s.add(chk)           MUTATION of a container           binds the receiver
 *     const h = mk()                      a factory returning a container   binds `h`, via `mk`
 *
 * None is a rule about a syntax. Each is the same question — does this expression carry a checker,
 * and what name does it reach — asked of a node instead of a substring.
 *
 * `returnsCarrier` is tracked separately from `carrier` because a name that asserts is not therefore
 * a name whose RESULT asserts. Conflating them taints every value computed by an asserting helper,
 * which in a test suite is most of them, and a mechanism that flags everything has stopped
 * discriminating.
 */
function carriers(m) {
  const carrier = new Set(m.imported);
  const returnsCarrier = new Set();
  const functionsByName = new Map();

  // Seed: a function whose body reaches a verdict, under every name it is bound to. Located by
  // walking to the function NODE rather than by enumerating the syntaxes a function can be declared
  // in — that enumeration lost to six ordinary spellings in one adversarial round.
  const bind = (name, node) => {
    if (node === null || node === undefined) return;
    if (isFunction(node)) functionsByName.set(name, node);
    if (isFunction(node) && m.reachesVerdict(node)) carrier.add(name);
  };
  for (const n of m.nodes) {
    if (n.type === "VariableDeclarator") for (const name of patternNames(n.id)) bind(name, n.init);
    // `const run = (xs, fn = chk) => ...` — the checker arrives as a parameter DEFAULT rather than
    // as an argument. A default is a binding whose right-hand side is evaluated at call time; there
    // is no sense in which it is a different event from `const fn = chk`. Found by round nineteen.
    if (n.type === "AssignmentPattern") for (const name of patternNames(n.left)) bind(name, n.right);
    if (n.type === "FunctionDeclaration" && n.id) bind(n.id.name, n);
    if (n.type === "ClassDeclaration" && n.id && m.reachesVerdict(n)) carrier.add(n.id.name);
  }

  /**
   * Does this expression hand on a carrier? A carrier mentioned as the CALLEE of a call does not,
   * because the value that results is data — unless the callee is known to RETURN a carrier, which
   * is round eighteen's `factory-returns-object` and is a property of the callee, not of the shape.
   */
  const carries = (node) =>
    contains(node, (x) => {
      if (m.isAssertCall(x) || x.type === "ThrowStatement") return true;
      if (x.type !== "Identifier") return false;
      const parent = m.parents.get(x);
      const called = parent?.type === "CallExpression" && parent.callee === x;
      if (called) return returnsCarrier.has(x.name);
      // A member ACCESS off a carrier still reaches the carrier: `h.chk` is `h`'s checker.
      if (parent?.type === "MemberExpression" && parent.property === x && !parent.computed) return false;
      return carrier.has(x.name);
    });

  // Fixed point. Each pass may taint a name that makes an earlier expression a carrier, so this runs
  // until nothing changes rather than once in source order — `const h = mk()` above `const mk = ...`
  // is legal JavaScript and must not depend on which line came first.
  for (let pass = 0; pass < 32; pass += 1) {
    const before = carrier.size + returnsCarrier.size;

    for (const n of m.nodes) {
      // A function whose body RETURNS a carrier. `mk = () => ({ chk })` returns a container of one.
      if (isFunction(n)) {
        const returnsOne =
          (n.body.type !== "BlockStatement" && carries(n.body)) ||
          (n.body.type === "BlockStatement" &&
            contains(n.body, (x) => x.type === "ReturnStatement" && x.argument !== null && carries(x.argument)));
        if (returnsOne) {
          for (const [name, fn] of functionsByName) if (fn === n) returnsCarrier.add(name);
        }
      }

      // A declaration.
      if (n.type === "VariableDeclarator" && n.init !== null && carries(n.init)) {
        for (const name of patternNames(n.id)) carrier.add(name);
      }

      // An assignment, of any shape. The LHS may be a pattern (`[a, b] = ...`), a member with a
      // named key (`o.c = ...`), or a member with a computed one (`reg["c"] = ...`). Binding the
      // ROOT of the target rather than its last segment makes all three the same event.
      if (n.type === "AssignmentExpression" && carries(n.right)) {
        if (n.left.type === "MemberExpression") {
          const root = rootObject(n.left);
          if (root?.type === "Identifier") carrier.add(root.name);
        } else {
          for (const name of patternNames(n.left)) carrier.add(name);
        }
      }

      // A mutation. `cs.push(chk)` and `s.add(chk)` reach the same place a binding would, and the
      // container was bound BEFORE the checker arrived, so nothing about its binding says so.
      if (
        n.type === "CallExpression" &&
        n.callee.type === "MemberExpression" &&
        !n.callee.computed &&
        n.callee.property.type === "Identifier" &&
        MUTATORS.has(n.callee.property.name) &&
        n.arguments.some((a) => carries(a))
      ) {
        const root = rootObject(n.callee.object);
        if (root?.type === "Identifier") carrier.add(root.name);
      }

      // Iterating a container of carriers binds the loop variable: `for (const c of s) c(f)`.
      if (n.type === "ForOfStatement" && carries(n.right)) {
        for (const name of patternNames(n.left)) carrier.add(name);
      }

      // A static that writes into its first argument taints that argument's root.
      if (n.type === "CallExpression" && n.arguments.length >= 2) {
        const via = staticPath(n.callee);
        if (via !== null && WRITES_INTO_FIRST_ARGUMENT.has(via) && n.arguments.slice(1).some((a) => carries(a))) {
          const root = rootObject(n.arguments[0]);
          if (root?.type === "Identifier") carrier.add(root.name);
        }
      }

      // A parameter default that carries. Seeded above for the directly function-valued case, and
      // repeated here so a default naming a name that only BECOMES a carrier on a later pass is not
      // missed — the seed runs once, this runs to a fixed point.
      if (n.type === "AssignmentPattern" && carries(n.right)) {
        for (const name of patternNames(n.left)) carrier.add(name);
      }

      // A carrier handed to a function taints the PARAMETER it lands on:
      //
      //     const run = (xs, fn) => { for (const f of xs) fn(f); };
      //     run(files, chk);
      //
      // Nothing inside `run` asserts, and `files` is consumed by an iteration whose verdict arrives
      // as an argument. Without following the argument into the parameter the harness is invisible,
      // and writing one is not an exotic way to structure a test — it is how a table-driven one is
      // normally written.
      if (n.type === "CallExpression" && n.callee.type === "Identifier") {
        const fn = functionsByName.get(n.callee.name);
        if (fn !== undefined) {
          n.arguments.forEach((arg, i) => {
            const param = fn.params[i];
            if (param !== undefined && carries(arg)) {
              for (const name of patternNames(param)) carrier.add(name);
            }
          });
        }
      }
    }

    if (carrier.size + returnsCarrier.size === before) break;
  }

  return carrier;
}

const isFunction = (n) =>
  n?.type === "FunctionDeclaration" || n?.type === "FunctionExpression" || n?.type === "ArrowFunctionExpression";

/**
 * Does this body reach a verdict, directly or through a name that carries one?
 *
 * `throw` counts. A loop that throws on a bad element makes exactly the same claim as one that
 * asserts on it, and reaches the same false green when the collection is empty. Recognising only the
 * token `assert` would let the whole throwing dialect through — not an exotic dialect, but how a
 * helper reports a problem when it has no assert in scope.
 */
function bodyReachesVerdict(m, carrierNames, body) {
  if (m.reachesVerdict(body)) return true;
  return contains(body, (x) => {
    if (x.type !== "Identifier" || !carrierNames.has(x.name)) return false;
    const parent = m.parents.get(x);
    // Used as a callee, a receiver, an index target or a tag — every way a carrier gets invoked.
    if (parent?.type === "MemberExpression" && parent.property === x && !parent.computed) return false;
    return true;
  });
}

/**
 * Does this body accumulate into an outer name that later reaches a verdict? The assertion has
 * simply been moved past the closing brace:
 *
 *     let bad = false;  for (const f of files) bad ||= !ok(f);   assert.ok(!bad);
 *     let n = 0;        for (const f of files) if (!ok(f)) n++;  assert.equal(n, 0);
 *
 * Kept SEPARATE from the direct case because it needs a check that a directly-asserting body does
 * not: nearly every guard in this suite iterates its own offenders list to build a message, and
 * `for (const s of vacuousSubjects(code)) offenders.push(...)` accumulates in exactly this shape
 * while being the opposite of a defect — an empty offenders list is the success. The caller only
 * treats accumulation as a verdict when the subject is NOT grounded in something proven live.
 */
function bodyAccumulatesInto(m, code, body) {
  const touched = new Set();
  walk(body, (n) => {
    if (n.type === "AssignmentExpression" || n.type === "UpdateExpression") {
      const target = n.type === "UpdateExpression" ? n.argument : n.left;
      const root = target.type === "MemberExpression" ? rootObject(target) : target;
      if (root?.type === "Identifier") touched.add(root.name);
      else for (const name of patternNames(target)) touched.add(name);
    }
    if (
      n.type === "CallExpression" &&
      n.callee.type === "MemberExpression" &&
      !n.callee.computed &&
      n.callee.property.type === "Identifier" &&
      MUTATORS.has(n.callee.property.name)
    ) {
      const root = rootObject(n.callee.object);
      if (root?.type === "Identifier") touched.add(root.name);
    }
    // A name declared inside the body is local to it, so accumulating into it survives nothing.
    if (n.type === "VariableDeclarator") for (const name of patternNames(n.id)) touched.delete(name);
    return true;
  });
  for (const name of touched) {
    if (mentionedInAssertion(code, name) && !provenByName(code, name)) return true;
  }
  return false;
}

// ── consumptions ─────────────────────────────────────────────────────────────────────────────────

/**
 * Every consumption in this file that would succeed on an empty subject, as `{ subject, via }`.
 * `subject` is source text, because that is what the report has to name; the ANALYSIS is over nodes.
 */
/**
 * Every consumption in this file that would succeed on an empty subject, as `{ subject, via }`.
 * `subject` is source text, because that is what the report has to name; the ANALYSIS is over nodes.
 *
 * TWO QUESTIONS, NOT A LIST OF SHAPES. Every rule below is one of:
 *
 *   ITERATION   a construct whose body runs once per element, so an empty subject runs it never
 *   DERIVATION  an expression that yields an empty result from an empty subject, whose value then
 *               reaches a verdict that an empty result satisfies
 *
 * The regular-expression mechanism this replaces had twenty-odd rules because each SPELLING of those
 * two questions needed its own pattern. Against a tree the spellings collapse: a receiver is a
 * receiver whether it was reached through `.call`, through `Reflect.apply`, or written in place, and
 * a value reaches an assertion by being walked to rather than by being adjacent in the text.
 */
export function consumptions(code, imported = new Set()) {
  const m = model(code, imported);
  DETACHED = new Map();
  for (const n of m.nodes) {
    if (n.type !== "VariableDeclarator" || n.id.type !== "Identifier" || n.init === null) continue;
    const method = namedProperty(n.init);
    if (method !== null) DETACHED.set(n.id.name, method);
  }
  const carrierNames = carriers(m);
  const found = [];
  const grounded = groundedNames(code);
  const groundedText = (text) => [...grounded].some((g) => new RegExp(String.raw`\b${g}\b`, "u").test(text));

  const push = (node, via) => {
    if (node === null || node === undefined) return;
    const subject = unwrapSubject(node);
    if (subject.type === "Literal" || subject.type === "TemplateLiteral") return;
    found.push({ subject: textOf(code, subject), via });
  };
  const isVerdict = (bodyNode, subjectNode) =>
    bodyReachesVerdict(m, carrierNames, bodyNode) ||
    (bodyAccumulatesInto(m, code, bodyNode) && !groundedText(textOf(code, subjectNode)));

  for (const n of m.nodes) {
    // ── ITERATION ────────────────────────────────────────────────────────────────────────────────

    // for (const x of S) — and `for await`, which is the same loop over the same emptiness.
    if (n.type === "ForOfStatement" && isVerdict(n.body, n.right)) push(n.right, "for-of");

    // for (const k in O) — an object with no own keys iterates zero times exactly as an empty array.
    if (n.type === "ForInStatement" && isVerdict(n.body, n.right)) push(n.right, "for-in");

    // while (i < S.length) / while (Q.length) / for (;i < S.length;) — index loops, which run zero
    // times on an empty S exactly as `for..of` does. `do..while` runs its body ONCE, which on an
    // empty subject means asserting against `S[0]` — `undefined` — and every guard in this suite
    // written that way skips its work on the undefined element and reaches the same false green.
    if (n.type === "WhileStatement" || n.type === "ForStatement" || n.type === "DoWhileStatement") {
      const test = n.test ?? null;
      if (test !== null) {
        const bound = lengthBoundSubject(test);
        if (bound !== null && isVerdict(n.body, bound)) push(bound, n.type === "DoWhileStatement" ? "do-while" : "index-loop");

        // while ((f = files.pop())) — the condition is an assignment that goes falsy the moment the
        // collection empties, so the body never runs.
        const drained = drainSubject(test);
        if (drained !== null && isVerdict(n.body, drained)) push(drained, "drain");

        // while (!(r = it.next()).done) — driving the iterator protocol by hand. On an empty
        // collection the first `next()` is already done, so the body never runs.
        const driver = iteratorDriver(test, m);
        if (driver !== null && isVerdict(n.body, driver)) push(driver, "iterator");
      }
    }

    // switch (files.length) { case 0: break; default: assert.fail("bad"); }
    //
    // A BARE LENGTH REACHING A VERDICT, with no derivation anywhere. Found by round twenty-one, and
    // it is the one shape here with no method call in it at all — every derivation rule above needs
    // something to have been derived.
    //
    // THE DIRECTION MATTERS, AND GETTING IT BACKWARDS WOULD BE WORSE THAN MISSING THE SHAPE.
    // `if (files.length === 0) throw ...` is an honest emptiness CHECK: the verdict is reached
    // exactly when the collection is empty. `if (files.length) assert...` is its inverse: the
    // verdict is skipped exactly when the collection is empty. Only the second is vacuity-prone, so
    // the rule asks which branch an empty subject takes rather than whether a branch asserts.
    if (n.type === "MemberExpression" && !n.computed && n.type !== "Literal") {
      const prop = n.property.type === "Identifier" ? n.property.name : null;
      if ((prop === "length" || prop === "size") && !groundedText(textOf(code, n.object))) {
        if (emptyBranchSkipsTheVerdict(m, n)) push(n.object, "length-verdict");
      }
    }

    // if (i >= xs.length) return;  ...assert...  walk(xs, i + 1);
    //
    // A LENGTH GUARD THAT DECIDES WHETHER A VERDICT IS REACHED IS AN INDEX LOOP, whatever supplies
    // the back edge. The rules above read `while (i < S.length)` and `for (; i < S.length;)`; this is
    // the same loop with the back edge written as a call, and on an empty subject the guard is true
    // at the first entry, so nothing after it ever runs. Found by round nineteen as a hand-rolled
    // recursion, which is the ordinary way that shape is written.
    //
    // Deliberately narrow. The consequent must be bare control flow that reaches no verdict of its
    // own — otherwise an ordinary guard clause that FAILS on an empty collection, which is a proof
    // of liveness rather than an escape from one, would be read as its opposite.
    if (n.type === "IfStatement" && n.alternate === null) {
      const guarded = emptyEntryGuard(n.test);
      if (guarded !== null && !m.reachesVerdict(n.consequent) && exitsEarly(n.consequent)) {
        const after = statementsAfter(m, n);
        if (after !== null && isVerdict(after, guarded)) push(guarded, "length-guard");
      }
    }

    // try { for (const f of files) validate(f); } catch { assert.fail(...) } — the loop body reaches
    // no verdict of its own; the verdict is the catch. On an empty subject nothing runs, nothing
    // throws, the catch never fires, and the whole construct is a pass that examined nothing.
    if (n.type === "TryStatement" && n.handler !== null && m.reachesVerdict(n.handler)) {
      walk(n.block, (x) => {
        if (x.type === "ForOfStatement" || x.type === "ForInStatement") push(x.right, "try-catch");
        return true;
      });
    }

    // const [head] = files; assert.equal(head, undefined) — destructuring takes the first element,
    // which is `undefined` on an empty subject. There is no derivation method here at all: the
    // consumption IS the pattern.
    if (n.type === "VariableDeclarator" && n.init !== null && destructuresByIndex(n.id)) {
      const names = patternNames(n.id);
      if (names.some((x) => mentionedInAssertion(code, x)) && !names.some((x) => provenByName(code, x))) {
        push(n.init, "destructure");
      }
    }

    if (n.type !== "CallExpression") continue;

    // ── ITERATION THROUGH A CALL ─────────────────────────────────────────────────────────────────

    const site = iterationSite(n);
    if (site !== null) {
      const { subject, method, callbacks } = site;
      // A callback that reaches a verdict makes this an iteration whatever the method is called.
      // `files.map((f) => { assert.ok(f); })` discards its result, so no rule about a derived
      // collection can see it — and it is the commonest way the shape is written.
      if (callbacks.some((cb) => isVerdict(cb, subject))) {
        push(subject, method === "forEach" ? "forEach" : `${method}-callback`);
        continue;
      }
      // `assert.ok(S.every(p))` is vacuously true, so `every` is a consumption on sight — its value
      // cannot be anything but a verdict about every element, and there are none.
      if (method === "every") {
        push(subject, "every");
        continue;
      }
    }

    // ── DERIVATION ───────────────────────────────────────────────────────────────────────────────

    const derived = derivationSubject(n);
    if (derived === null) continue;
    const { subject, kind } = derived;

    // `some`/`find` are EXEMPT as liveness proofs precisely because they are falsy on an empty
    // subject. That same falsity becomes a passing verdict the moment it is negated or asserted
    // absent — `assert.ok(!S.some(p))`, `const bad = S.find(p); assert.equal(bad, undefined)`. The
    // exemption is this mechanism's own, and these are the two shapes that turn it inside out.
    if (kind === "presence") {
      const inverted = valueIsNegated(m, n);
      const absent = boundNamesAssertedAbsent(m, code, n);
      const guarded = guardsAVerdict(m, n);
      if (inverted || absent || guarded) push(subject, inverted ? "negated-some" : absent ? "find" : "if-guard");
      continue;
    }

    // Everything else: an empty subject yields an empty result, so the question is only whether the
    // verdict that result reaches would be satisfied by emptiness. Asked in the fail-closed
    // direction — an assertion form nobody recognised leaves the derivation flagged, never exempted.
    // See `assertion-shape.mjs` for why the closed set is the REFUTING one.
    if (!groundedText(textOf(code, subject)) && valueReachesVacuousVerdict(m, code, n)) {
      push(subject, kind);
    }
  }

  return found;
}

/**
 * An iteration reached through a call, in whichever position the subject was written.
 * `S.forEach(cb)`, `Array.prototype.forEach.call(S, cb)`, `Reflect.apply(Array.prototype.forEach, S,
 * [cb])` and `Array.from(S, cb)` are one event with the operands moved around, and the tree says so.
 */
function iterationSite(n) {
  const path = staticPath(n.callee);

  if (path === "Array.from" && n.arguments.length >= 2) {
    return { subject: n.arguments[0], method: "Array.from", callbacks: n.arguments.slice(1) };
  }
  // Reflect.apply(fn, thisArg, argsArray) — borrowed iteration one level further out, with the
  // subject as the SECOND argument of a different function entirely.
  if (path === "Reflect.apply" && n.arguments.length >= 2) {
    const borrowed = staticPath(n.arguments[0]);
    const method = borrowed === null ? null : borrowed.split(".").pop();
    if (method !== null && ITERATING_METHODS.has(method)) {
      const args = n.arguments[2];
      const callbacks = args?.type === "ArrayExpression" ? args.elements.filter((e) => e !== null) : n.arguments.slice(2);
      return { subject: n.arguments[1], method, callbacks };
    }
    return null;
  }

  const method = namedProperty(n.callee);

  // `files["forEach"](chk)` — the key is a STRING, and this analysis reads source whose string
  // contents have been blanked to spaces so a specimen held as data cannot satisfy a rule about
  // what a file asserts. The key is therefore unknowable, and unknowable is not benign: it could be
  // `forEach`. Round twenty-three escaped through exactly that gap, and the fail-closed reading is
  // to treat a call through an unreadable key whose argument reaches a verdict as an iteration of
  // the receiver. Not knowing is not a pass.
  if (method !== null && n.callee.computed && UNREADABLE_KEY(method)) {
    return { subject: n.callee.object, method: "computed-key", callbacks: n.arguments };
  }
  if (method === null) return null;

  // `Object.groupBy(files, cb)` is a STATIC: its receiver is a namespace and the subject is the
  // first argument. Reading the receiver as the subject reported `Object` as the collection nobody
  // proved non-empty, which is a nonsense finding even though the file was correctly flagged.
  // Round twenty-three found it as a wrong SUBJECT rather than as an escape.
  if (n.callee.object.type === "Identifier" && STATIC_NAMESPACES.has(n.callee.object.name)) {
    if (CALLBACK_METHODS.has(method) && n.arguments.length >= 2) {
      return { subject: n.arguments[0], method, callbacks: n.arguments.slice(1) };
    }
    return null;
  }

  if (CALLBACK_METHODS.has(method)) return { subject: n.callee.object, method, callbacks: n.arguments };

  // `Array.prototype.every.call(S, p)` — the method is two segments back and the subject moved into
  // the first argument. `call` and `apply` are the only two ways to invoke a method on a receiver it
  // was not reached through, which is exactly what moves a subject out of receiver position.
  if ((method === "call" || method === "apply") && n.arguments.length > 0) {
    const owner = n.callee.object;
    // `const m = files.forEach; m.call(files, chk)` — the method was DETACHED into a name before
    // being borrowed. Resolving the name back to what it was bound from makes that the same event
    // as borrowing it in place. Round twenty-three.
    const borrowed = namedProperty(owner) ?? (owner.type === "Identifier" ? detachedMethodName(owner.name) : null);
    if (borrowed !== null && CALLBACK_METHODS.has(borrowed)) {
      const rest = n.arguments.slice(1);
      const callbacks = method === "apply" && rest[0]?.type === "ArrayExpression" ? rest[0].elements.filter(Boolean) : rest;
      return { subject: n.arguments[0], method: borrowed, callbacks };
    }
  }
  return null;
}

/**
 * The collection a derivation is derived FROM, with the kind of emptiness-safety it has.
 * `preserving` yields an empty result from an empty subject; `presence` yields a falsy ELEMENT.
 */
/** The method a name was bound from, for `const m = files.forEach`. Set per analysis by `model`. */
let DETACHED = new Map();
const detachedMethodName = (name) => DETACHED.get(name) ?? null;

function derivationSubject(n) {
  const path = staticPath(n.callee);
  if (path !== null && /^Object\.(?:keys|values|entries|groupBy|fromEntries)$/u.test(path) && n.arguments.length >= 1) {
    return { subject: n.arguments[0], kind: "derived" };
  }
  if (path === "Array.from" && n.arguments.length >= 1) return { subject: n.arguments[0], kind: "derived" };
  const method = namedProperty(n.callee);
  if (method === null) return null;
  if (n.callee.object.type === "Identifier" && STATIC_NAMESPACES.has(n.callee.object.name)) return null;
  if (DERIVING_METHODS.has(method)) return { subject: n.callee.object, kind: "derived" };
  if (method === "some" || method === "find" || method === "findIndex" || method === "findLast") {
    return { subject: n.callee.object, kind: "presence" };
  }
  // `.at(0)` / `.at(-1)` — `find` with the predicate left out. On an empty subject the result is
  // `undefined`, and asserting that it IS undefined is a pass that examined nothing. Found by round
  // twenty; the same inversion `find` and `const [head] = files` already carry.
  if (method === "at" || method === "shift" || method === "pop") {
    return { subject: n.callee.object, kind: "presence" };
  }
  return null;
}

/** Methods whose result is empty exactly when the receiver is. */
const DERIVING_METHODS = new Set(["filter", "map", "flatMap", "reduce", "flat", "entries", "keys", "values"]);

/**
 * A guard that is TRUE on first entry when the subject is empty, so everything after it is skipped:
 * `i >= xs.length`, `i === xs.length`, `!xs.length`. Returns the subject, or null.
 */
function emptyEntryGuard(test) {
  if (test.type === "UnaryExpression" && test.operator === "!") {
    const inner = lengthBoundSubject(test.argument);
    return test.argument.type === "MemberExpression" ? inner : null;
  }
  if (test.type !== "BinaryExpression") return null;
  if (![">=", "===", "==", "<="].includes(test.operator)) return null;
  const side = test.operator === "<=" ? test.left : test.right;
  const other = test.operator === "<=" ? test.right : test.left;
  if (side.type !== "MemberExpression" || side.computed || side.property.type !== "Identifier") return null;
  if (side.property.name !== "length" && side.property.name !== "size") return null;
  // `i >= xs.length` and `xs.length <= i` are the same guard. A comparison against a LITERAL is a
  // different claim — `xs.length >= 1` is a proof of liveness — so only a variable index qualifies.
  return other.type === "Identifier" ? side.object : null;
}

/** Does this branch do nothing but leave? `return`, `break`, `continue`. */
function exitsEarly(node) {
  if (node.type === "ReturnStatement" || node.type === "BreakStatement" || node.type === "ContinueStatement") return true;
  if (node.type !== "BlockStatement") return false;
  return node.body.length > 0 && node.body.every((x) => exitsEarly(x));
}

/** The statements following this one in its own block, as a synthetic block, or null. */
function statementsAfter(m, node) {
  const parent = m.parents.get(node);
  if (parent === undefined || parent === null || !Array.isArray(parent.body)) return null;
  const i = parent.body.indexOf(node);
  if (i === -1 || i === parent.body.length - 1) return null;
  return { type: "BlockStatement", body: parent.body.slice(i + 1), start: node.end, end: parent.end };
}

/** The subject of an index loop: `i < S.length`, `i < S.size`, or the bare `S.length` a drain uses. */
function lengthBoundSubject(test) {
  const t = test.type === "UnaryExpression" && test.operator === "!" ? test.argument : test;
  if (t.type === "BinaryExpression" && ["<", "<=", ">", ">="].includes(t.operator)) {
    for (const side of [t.right, t.left]) {
      if (side.type === "MemberExpression" && !side.computed && side.property.type === "Identifier") {
        if (side.property.name === "length" || side.property.name === "size") return side.object;
      }
    }
  }
  if (t.type === "MemberExpression" && !t.computed && t.property.type === "Identifier") {
    if (t.property.name === "length" || t.property.name === "size") return t.object;
  }
  return null;
}

/** `while ((f = files.pop()))` — the subject being drained, or null. */
function drainSubject(test) {
  let subject = null;
  walk(test, (x) => {
    if (
      subject === null &&
      x.type === "CallExpression" &&
      x.callee.type === "MemberExpression" &&
      !x.callee.computed &&
      x.callee.property.type === "Identifier" &&
      (x.callee.property.name === "pop" || x.callee.property.name === "shift")
    ) {
      subject = x.callee.object;
    }
    return true;
  });
  return subject;
}

/**
 * The iterator a loop is driving by hand, or null. Either the test advances it —
 * `while (!(r = it.next()).done)` — or the test only reads `.done` and the advance happens around
 * it: `let r = it.next(); while (!r.done) { ...; r = it.next(); }`. Both are the iterator protocol
 * written out, and on an empty collection the first `next()` is already done, so the body never
 * runs. Round twenty-two found the second spelling.
 */
function iteratorDriver(test, m = null) {
  let driver = nextReceiverIn(test);
  if (driver !== null) return driver;
  // The test reads `.done` but advances nothing: find the handle in the enclosing program.
  if (m === null) return null;
  const readsDone = contains(test, (x) =>
    x.type === "MemberExpression" && !x.computed && x.property.type === "Identifier" && x.property.name === "done");
  if (!readsDone) return null;
  for (const n of m.nodes) {
    driver = nextReceiverIn(n);
    if (driver !== null) return driver;
  }
  return null;
}

function nextReceiverIn(root) {
  let found = null;
  walk(root, (x) => {
    if (
      found === null &&
      x.type === "CallExpression" &&
      x.callee.type === "MemberExpression" &&
      !x.callee.computed &&
      x.callee.property.type === "Identifier" &&
      x.callee.property.name === "next" &&
      x.arguments.length === 0
    ) {
      found = x.callee.object;
    }
    return true;
  });
  return found;
}

/** Is this value consumed under a logical negation? `assert.ok(!S.some(p))`. */
function valueIsNegated(m, node) {
  let cur = node;
  for (let i = 0; i < 8; i += 1) {
    const parent = m.parents.get(cur);
    if (parent === undefined || parent === null) return false;
    if (parent.type === "UnaryExpression" && parent.operator === "!") return true;
    if (parent.type === "MemberExpression" || parent.type === "ChainExpression") { cur = parent; continue; }
    return false;
  }
  return false;
}

/** `const bad = S.find(p); assert.equal(bad, undefined)` — an element asserted ABSENT. */
function boundNamesAssertedAbsent(m, code, node) {
  const decl = enclosingDeclarator(m, node);
  if (decl === null) return false;
  const names = patternNames(decl.id);
  if (!names.some((x) => mentionedInAssertion(code, x))) return false;
  return !names.some((x) => assertsPresence(code, x));
}

/** `if (S.some(p)) assert.fail(...)` — the verdict lives in a branch an empty S never enters. */
function guardsAVerdict(m, node) {
  let cur = node;
  for (let i = 0; i < 12; i += 1) {
    const parent = m.parents.get(cur);
    if (parent === undefined || parent === null) return false;
    if ((parent.type === "IfStatement" || parent.type === "ConditionalExpression") && parent.test === cur) {
      return m.reachesVerdict(parent.consequent);
    }
    if (parent.type === "SwitchStatement" && parent.discriminant === cur) return m.reachesVerdict(parent);
    cur = parent;
  }
  return false;
}

/**
 * Does an EMPTY subject skip the verdict this length reaches? True only when the branch an empty
 * collection takes asserts nothing and some other branch does — which is vacuity — and false for the
 * honest inverse, where emptiness is what the verdict is about.
 */
function emptyBranchSkipsTheVerdict(m, lengthNode) {
  let cur = lengthNode;
  let emptyValue = { kind: "zero" };
  for (let i = 0; i < 12; i += 1) {
    const parent = m.parents.get(cur);
    if (parent === undefined || parent === null) return false;

    if (parent.type === "SwitchStatement" && parent.discriminant === cur) {
      if (emptyValue.kind !== "zero") return false;
      // The case an empty collection lands in: `case 0`, or `default` when no case names zero.
      const zero = parent.cases.find((c) => c.test !== null && c.test.type === "Literal" && c.test.value === 0);
      const taken = zero ?? parent.cases.find((c) => c.test === null);
      if (taken === undefined) return false;
      const others = parent.cases.filter((c) => c !== taken);
      return !m.reachesVerdict(taken) && others.some((c) => m.reachesVerdict(c));
    }

    if ((parent.type === "IfStatement" || parent.type === "ConditionalExpression") && parent.test === cur) {
      // `files.length` is falsy when empty; `files.length > 0` likewise. `=== 0` is the inverse.
      const truthyWhenEmpty = emptyValue.kind === "truthy";
      if (emptyValue.kind === "unknown") return false;
      const skipped = truthyWhenEmpty ? (parent.alternate ?? null) : parent.consequent;
      const taken = truthyWhenEmpty ? parent.consequent : (parent.alternate ?? null);
      if (skipped === null) return false;
      return m.reachesVerdict(skipped) && (taken === null || !m.reachesVerdict(taken));
    }

    // Track what the enclosing expression evaluates to when the collection is empty, so the branch
    // question above can be answered rather than guessed.
    if (parent.type === "BinaryExpression") {
      const other = parent.left === cur ? parent.right : parent.left;
      const n0 = other.type === "Literal" && typeof other.value === "number" ? other.value : null;
      if (n0 === null) return false;
      const flipped = parent.left !== cur;
      const op = flipped ? { "<": ">", ">": "<", "<=": ">=", ">=": "<=" }[parent.operator] ?? parent.operator : parent.operator;
      const truthy =
        op === "===" || op === "==" ? 0 === n0
        : op === "!==" || op === "!=" ? 0 !== n0
        : op === ">" ? 0 > n0
        : op === ">=" ? 0 >= n0
        : op === "<" ? 0 < n0
        : op === "<=" ? 0 <= n0
        : null;
      if (truthy === null) return false;
      emptyValue = { kind: truthy ? "truthy" : "falsy" };
    } else if (parent.type === "UnaryExpression" && parent.operator === "!") {
      emptyValue = { kind: emptyValue.kind === "truthy" ? "falsy" : "truthy" };
    } else if (parent.type !== "ChainExpression") {
      return false;
    }
    cur = parent;
  }
  return false;
}

/**
 * Does this pattern take elements out of a collection BY POSITION? `const [head] = files` obviously
 * does; `const { 0: first } = files` does the same thing through an object pattern with a numeric
 * key, which round twenty-three escaped through. Both bind `undefined` on an empty subject, and an
 * assertion that the binding IS undefined is a pass that examined nothing.
 */
const DIGITS = new RegExp("^" + String.fromCharCode(92) + "d+$", "u");

function destructuresByIndex(pattern) {
  if (pattern.type === "ArrayPattern") return true;
  if (pattern.type !== "ObjectPattern") return false;
  return pattern.properties.some(
    (prop) =>
      prop.type === "Property" &&
      ((prop.key.type === "Literal" && DIGITS.test(String(prop.key.value))) ||
        (prop.computed && prop.key.type === "Literal" && typeof prop.key.value === "number")),
  );
}

/** The `const`/`let`/`var` declarator this expression is the initialiser of, or null. */
function enclosingDeclarator(m, node) {
  let cur = node;
  for (let i = 0; i < 12; i += 1) {
    const parent = m.parents.get(cur);
    if (parent === undefined || parent === null) return null;
    if (parent.type === "VariableDeclarator") return parent.init === cur ? parent : null;
    if (parent.type === "ReturnStatement" || isFunction(parent)) return null;
    cur = parent;
  }
  return null;
}

/**
 * Does the value of this derivation reach a verdict that an EMPTY result would satisfy?
 *
 * Walked outward through the enclosing expression rather than matched against the text around it,
 * which is what lets a sink of any depth be read: `.length`, a ternary, `.join(",")`, a comparison,
 * a switch discriminant. The regular-expression mechanism enumerated sinks and lost — the sink space
 * contains `.toString()`, `.at(0)`, `JSON.stringify(x) === "[]"` and does not end.
 */
function valueReachesVacuousVerdict(m, code, node) {
  let cur = node;
  for (let i = 0; i < 32; i += 1) {
    const parent = m.parents.get(cur);
    if (parent === undefined || parent === null) return false;

    if (m.isAssertCall(parent)) {
      // The assertion MESSAGE is never the subject of the claim, so a derivation appearing only
      // there is not a verdict about it.
      if (parent.arguments.indexOf(cur) > (isConditionForm(parent) ? 0 : 1)) return false;
      return !refutesEmptiness(assertionShapeOf(code, parent), liveBase(code));
    }
    if (parent.type === "VariableDeclarator" && parent.init === cur) {
      const names = patternNames(parent.id);
      return names.some((x) => nameReachesVerdict(m, code, x)) && !names.some((x) => provenByName(code, x));
    }
    if ((parent.type === "IfStatement" || parent.type === "ConditionalExpression") && parent.test === cur) {
      return m.reachesVerdict(parent.consequent) || m.reachesVerdict(parent.alternate ?? parent);
    }
    if (parent.type === "SwitchStatement" && parent.discriminant === cur) return m.reachesVerdict(parent);
    // A value that leaves this expression — returned, stored in a structure, handed to a function —
    // is no longer traceable here. Stopping is the fail-closed choice only where a binding rule
    // picks it up; a `return` genuinely leaves the file's reach, so it stops.
    if (parent.type === "ReturnStatement") { cur = parent; continue; }
    if (isFunction(parent)) {
      const name = getterPropertyName(m, parent);
      if (name === null) return false;
      // The getter's value is read as `X.<name>`. Vacuous unless some assertion reading it refutes
      // emptiness — the same question asked of a property instead of a variable.
      return readerReachesVacuousVerdict(m, code, name);
    }
    if (parent.type === "AssignmentExpression" && parent.right === cur) {
      const root = parent.left.type === "MemberExpression" ? rootObject(parent.left) : parent.left;
      const names = root?.type === "Identifier" ? [root.name] : patternNames(parent.left);
      return names.some((x) => mentionedInAssertion(code, x)) && !names.some((x) => provenByName(code, x));
    }
    cur = parent;
  }
  return false;
}

/** The property name this function is the getter for, or null if it is an ordinary function. */
function getterPropertyName(m, fn) {
  const parent = m.parents.get(fn);
  if (parent === undefined || parent === null) return null;
  if ((parent.type === "Property" || parent.type === "MethodDefinition") && parent.kind === "get") {
    return parent.key.type === "Identifier" ? parent.key.name : namedProperty({ type: "MemberExpression", computed: true, property: parent.key });
  }
  return null;
}

/** Does every read of `X.<name>` reach a verdict an empty collection would satisfy? */
function readerReachesVacuousVerdict(m, code, name) {
  let read = false;
  for (const n of m.nodes) {
    if (namedProperty(n) !== name) continue;
    read = true;
    if (valueReachesVacuousVerdict(m, code, n)) return true;
  }
  // Never read at all: the getter computes nothing anybody asserts about, so it is data shaping.
  return read ? false : false;
}

/** Does this assertion take its whole condition as the first argument? `ok`, and a bare `assert`. */
const isConditionForm = (call) =>
  call.callee.type === "Identifier" ||
  (call.callee.type === "MemberExpression" && !call.callee.computed && call.callee.property.name === "ok");

/** An assertion call in the `{ name, args }` shape `assertion-shape.mjs` reads. */
function assertionShapeOf(code, node) {
  const name =
    node.callee.type === "MemberExpression" && !node.callee.computed && node.callee.property.type === "Identifier"
      ? node.callee.property.name
      : "assert";
  return { name, args: node.arguments.map((a) => textOf(code, a)) };
}

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

// ── subjects ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Strip the wrappings that carry emptiness through unchanged, so the liveness question lands on the
 * collection actually discovered.
 *
 * The first four cases are the round-eighteen SUBJECT escapes, and none of them is a rule this file
 * maintains — three are simply the tree acorn produces. `(files)` is not a node at all without
 * `preserveParens`; `(0, files)` is a SequenceExpression whose value is its last expression; `await
 * load()` is one `.argument` away. Only `?? []` needed writing down.
 *
 * `Object.entries|values|keys(X)` is a STOP, not an unwrapping. The member count of the object IS
 * what those yield, so it is legitimate evidence of liveness there — which is exactly not true of an
 * object consumed directly by `for-of`. See `staticallyNonEmptyNode`.
 */
function unwrapSubject(node) {
  let cur = node;
  for (let i = 0; i < 64; i += 1) {
    if (cur.type === "SequenceExpression") { cur = cur.expressions[cur.expressions.length - 1]; continue; }
    if (cur.type === "AwaitExpression") { cur = cur.argument; continue; }
    if (cur.type === "ChainExpression") { cur = cur.expression; continue; }
    if (cur.type === "TSNonNullExpression") { cur = cur.expression; continue; }
    // `files ?? []` / `files || []` — the fallback makes the empty case MORE reachable, not less.
    if (cur.type === "LogicalExpression" && isEmptyCollectionLiteral(cur.right)) { cur = cur.left; continue; }
    // `[...files]` with nothing else in it.
    if (cur.type === "ArrayExpression" && cur.elements.length === 1 && cur.elements[0]?.type === "SpreadElement") {
      cur = cur.elements[0].argument;
      continue;
    }
    if (cur.type === "CallExpression" || cur.type === "NewExpression") {
      const path = staticPath(cur.callee);
      if (path !== null && /^Object\.(?:entries|values|keys)$/u.test(path)) return cur;
      if (path !== null && COPYING.has(path) && cur.arguments.length >= 1) { cur = cur.arguments[0]; continue; }
      if (
        cur.type === "CallExpression" &&
        cur.callee.type === "MemberExpression" &&
        !cur.callee.computed &&
        cur.callee.property.type === "Identifier" &&
        PRESERVING.has(cur.callee.property.name)
      ) {
        const method = cur.callee.property.name;
        const receiver = cur.callee.object;
        // FLATTENING IS NOT A COPY, AND ITS RECEIVER'S MEMBERS ARE NOT ITS ELEMENTS.
        // `[files].flat()` is empty exactly when `files` is, so unwrapping to `[files]` and then
        // reading its one member as proof of liveness is a false proof — the same fault as
        // `symbol-iterator`, reached through flattening rather than through `Symbol.iterator`.
        // A single-element literal unwraps to the collection it holds; anything wider is ambiguous
        // and stops here, where a call expression is not statically non-empty and so stays flagged.
        if ((method === "flat" || method === "flatMap") && receiver.type === "ArrayExpression") {
          const own = receiver.elements.filter((e) => e !== null);
          if (own.length === 1 && own[0].type !== "SpreadElement") { cur = own[0]; continue; }
          return cur;
        }
        cur = receiver;
        continue;
      }
    }
    return cur;
  }
  return cur;
}

const isEmptyCollectionLiteral = (n) =>
  (n?.type === "ArrayExpression" && n.elements.length === 0) ||
  (n?.type === "ObjectExpression" && n.properties.length === 0);

/**
 * The root of an expression written as text. Kept as a text entry point because the report names
 * subjects as source, and because a caller with a fragment rather than a file has no tree.
 */
export function rootSubject(text) {
  try {
    const ast = parseModule(`(${text.trim()})`);
    const expr = ast.body[0]?.expression;
    if (expr === undefined) return text.trim();
    const inner = unwrapSubject(expr);
    return `(${text.trim()})`.slice(inner.start, inner.end);
  } catch {
    return text.trim();
  }
}

// ── liveness ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Is this subject spelled out in the file with elements visible, so a runtime proof of it would be
 * nonsense? The exemption is about STATIC certainty, not convenience.
 *
 * THE DISTINCTION THE TREE MAKES, AND THE REGEX COULD NOT. An ARRAY literal's members ARE its
 * elements, so `[1, 2]` is proof. An OBJECT literal's members are NOT what iterating it yields —
 * `Symbol.iterator` decides that, and it can yield from a collection defined elsewhere:
 *
 *     const box = { *[Symbol.iterator]() { for (const f of files) yield f; } };
 *     for (const f of box) assert.ok(f);        // vacuous whenever `files` is empty
 *
 * Round twelve recorded that specimen as an attribution failure. It is not: the consumption is found
 * and the subject IS `box`. It escaped because member count was read as proof of liveness for an
 * object as readily as for an array. `Object.entries({ a: 1 })` remains proof, because there the
 * members are precisely what is yielded — the two cases differ in the tree and only in the tree.
 */
function staticallyNonEmptyNode(node, { asIterable }) {
  if (node.type === "ArrayExpression") {
    return node.elements.some((e) => e !== null && e.type !== "SpreadElement");
  }
  if (node.type === "ObjectExpression") {
    // Only where the members are what gets consumed — i.e. never for a bare `for-of` subject.
    return !asIterable && node.properties.some((p) => p.type !== "SpreadElement");
  }
  if (node.type === "CallExpression") {
    const path = staticPath(node.callee);
    if (path !== null && /^Object\.(?:entries|values|keys)$/u.test(path) && node.arguments.length === 1) {
      return staticallyNonEmptyNode(node.arguments[0], { asIterable: false });
    }
  }
  return false;
}

/**
 * A collection spelled out in this file cannot be empty at execution time. Text entry point, used
 * for chain links that are names rather than nodes.
 */
export function staticallyNonEmpty(code, subject) {
  const asIterable = true;
  try {
    const expr = parseModule(`(${subject.trim()})`).body[0]?.expression;
    if (expr !== undefined && staticallyNonEmptyNode(expr, { asIterable: expr.type !== "ObjectExpression" ? asIterable : true })) {
      return true;
    }
  } catch {
    /* not an expression on its own; fall through to the binding search below */
  }
  const name = unwrapName(subject);
  if (name === null) return false;
  let live = false;
  try {
    const m = model(code, new Set());
    for (const n of m.nodes) {
      if (n.type !== "VariableDeclarator" || n.init === null) continue;
      if (!patternNames(n.id).includes(name)) continue;
      // Consumed by `for-of` unless the reference was through `Object.entries`, which the caller
      // has already unwrapped — so an object literal bound to a name is NOT proof here.
      if (staticallyNonEmptyNode(n.init, { asIterable: !/^Object\./u.test(subject.trim()) })) live = true;
    }
  } catch {
    return false;
  }
  return live;
}

/** `Object.entries(X)` / `[...X]` / `X` -> `X`. Anything else -> null. */
function unwrapName(subject) {
  const wrapped = /^Object\.(?:entries|values|keys)\((.+)\)$/u.exec(subject.trim());
  const inner = (wrapped ? wrapped[1] : subject).trim();
  const spread = /^\[\s*\.\.\.(.+)\]$/u.exec(inner);
  const bare = (spread ? spread[1] : inner).trim();
  return /^[A-Za-z_$][\w$]*$/u.test(bare) ? bare : null;
}

/**
 * Follow a name back through emptiness-preserving bindings to the collection actually discovered, so
 * `missing` -> `probes` -> `ORACLE_TAGS` reports the tag list rather than the last alias of it.
 * Without this the same defect is reported once per intermediate name.
 */
export function resolveChain(code, text) {
  const chain = [rootSubject(text)];
  let bind;
  try {
    bind = new Map();
    const m = model(code, new Set());
    for (const n of m.nodes) {
      if (n.type !== "VariableDeclarator" || n.init === null) continue;
      if (n.id.type !== "Identifier") continue;
      if (!bind.has(n.id.name)) bind.set(n.id.name, textOf(code, n.init));
    }
  } catch {
    return chain;
  }
  const seen = new Set();
  let cur = chain[0];
  while (/^[A-Za-z_$][\w$]*$/u.test(cur) && bind.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    const next = rootSubject(bind.get(cur));
    if (next === cur) break;
    // Stop at a literal. `staticallyNonEmpty` reasons about NAMES, so resolving `CASES` to the text
    // of its own table would defeat that exemption and re-flag every table-driven test in the suite.
    if (/^[[{]/u.test(next)) break;
    chain.push(next);
    cur = next;
  }
  return chain;
}

/** Names bound from something already proven live, transitively. */
function groundedNames(code) {
  const grounded = new Set([...livenessAssertions(code), ...livenessFromExpectation(code)]);
  let bind;
  try {
    bind = [];
    const m = model(code, new Set());
    for (const n of m.nodes) {
      if (n.type !== "VariableDeclarator" || n.init === null || n.id.type !== "Identifier") continue;
      bind.push([n.id.name, textOf(code, n.init)]);
    }
  } catch {
    return grounded;
  }
  for (let pass = 0; pass < 16; pass += 1) {
    let changed = false;
    for (const [name, init] of bind) {
      if (grounded.has(name)) continue;
      if ([...grounded].some((g) => new RegExp(String.raw`\b${g}\b`, "u").test(init))) {
        grounded.add(name);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return grounded;
}

/** Names this file proves non-empty by a bare assertion, for `refutesEmptiness`'s expected-name rule. */
function liveBase(code) {
  return livenessAssertions(code);
}

/**
 * Does this name reach a verdict at all? A binding that does not is data shaping, not a verdict.
 *
 * INSIDE a verdict, not NEAR one. This was a text search for the name within 160 characters of a
 * `throw` — the kind of approximation a scanner without a tree is forced into. It flagged two
 * honest bindings in this repository's own ST-16 test whose entire relationship to the `throw`
 * beside them was proximity. A tree answers the question that was actually being asked.
 */
function mentionedInAssertion(code, name) {
  try {
    const m = model(code, new Set());
    for (const n of m.nodes) {
      if (!m.isAssertCall(n) && n.type !== "ThrowStatement") continue;
      if (contains(n, (x) => x.type === "Identifier" && x.name === name)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Does this name reach a verdict at all — inside an assertion, or by GUARDING one?
 *
 *     const n = files.filter((f) => !ok(f)).length;
 *     if (n) assert.fail("bad files");
 *
 * `n` appears in no assertion. It decides whether one runs, which is the same claim written as
 * control flow, and is false green on an empty `files` in exactly the same way.
 */
function nameReachesVerdict(m, code, name) {
  if (mentionedInAssertion(code, name)) return true;
  for (const n of m.nodes) {
    if (n.type !== "Identifier" || n.name !== name) continue;
    if (guardsAVerdict(m, n)) return true;
  }
  return false;
}

function provenByName(code, name) {
  // An expectation is a proof as much as a bound is: `assert.deepEqual(entries.sort(), [a, b].sort())`
  // cannot hold with `entries` empty. `provenLive` already reads it at the SUBJECT end; reading it
  // here too is the same rule applied to a name, not a new exemption.
  if (livenessFromExpectation(code).has(name)) return true;
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
 * `assert.deepEqual(X, ["OUT_OF_SCOPE"])` proves X had an element — the expected value is non-empty,
 * so the assertion cannot hold on an empty X. Liveness stated as an exact value rather than a bound,
 * and how `enforce.test.mjs` establishes `PASSING` on the line above the loop that consumes it.
 */
export function livenessFromExpectation(code) {
  const hits = new Set();
  const re = /assert[.](?:deepEqual|deepStrictEqual)\s*[(]\s*([^,]+?)\s*,\s*\[\s*([^\]\s])/gu;
  for (const m of code.matchAll(re)) {
    if (m[2] === "]") continue;
    hits.add(rootSubject(m[1].trim()));
  }
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

const RE_SPECIAL = new Set([".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", String.fromCharCode(92)]);

function escapeRe(s) {
  return [...s].map((c) => (RE_SPECIAL.has(c) ? String.fromCharCode(92) + c : c)).join("");
}

/**
 * The subjects this file consumes vacuum-safely without ever proving they had elements.
 *
 * Throws `Unparseable` rather than returning nothing when the file cannot be read. Silence from an
 * analysis that never ran is indistinguishable from silence from an analysis that found nothing, and
 * this mechanism exists precisely to refuse that conflation.
 */
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
