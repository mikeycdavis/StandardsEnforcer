/**
 * ST-15. The discriminator: which assertions derive a verdict from a collection, and which of those
 * prove the collection was non-empty.
 *
 * WHY A DISCRIMINATOR AT ALL. "Assert an empty array" is not the property. `scope.test.mjs` asserts
 * `deepEqual(f.kinds, [])` on a field of one result object, and there is no collection there that
 * could have been vacuously empty — requiring a liveness assertion would be nonsense. The property
 * is narrower and mechanical:
 *
 *     an array DECLARED empty in this file, PUSHED to inside the file, and then ASSERTED empty
 *
 * That is an accumulator over an iteration. Its emptiness means "nothing was found" — or it means
 * "nothing was looked at", and those are indistinguishable from the outside. A file containing that
 * shape must also prove, somewhere, that some collection it handled was non-empty.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not attempt to prove the liveness assertion covers the
 * SAME collection the accumulator iterated. That needs a type system, not a scan, and a discriminator
 * that guessed would fail the criterion that legitimate guards stay green. The file-level rule is
 * exactly the pattern ST-11 established and ST-12 audited by hand; this makes it executable.
 */

/** `const X = []` / `let X = []` that is later pushed to — an accumulator over an iteration. */
export function accumulators(code) {
  const declared = new Set();
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[\s*\]/gu)) {
    declared.add(m[1]);
  }
  const pushed = new Set();
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*[.]push\s*[(]/gu)) pushed.add(m[1]);
  return new Set([...declared].filter((id) => pushed.has(id)));
}

/** `assert.deepEqual(X, [])` / `assert.equal(X.length, 0)` — a verdict of "nothing was found". */
export function emptyVerdicts(code) {
  const hits = new Set();
  const pats = [
    /assert[.](?:deepEqual|deepStrictEqual)\s*[(]\s*([A-Za-z_$][\w$]*)\s*,\s*\[\s*\]/gu,
    /assert[.](?:equal|strictEqual)\s*[(]\s*([A-Za-z_$][\w$]*)[.]length\s*,\s*0\s*[)]/gu,
  ];
  for (const re of pats) for (const m of code.matchAll(re)) hits.add(m[1]);
  return hits;
}

/**
 * An assertion that some collection was non-empty. Deliberately broad in FORM and strict in MEANING:
 * an exact count (`equal(x.length, 2)`) is a stronger liveness claim than `> 0`, and `diagram-sync`
 * uses `>= 2`. A rule that only recognised `> 0` would have reddened an honest guard.
 */
export function livenessAssertions(code) {
  const hits = new Set();

  // `x.length > 0` and `x.length >= 1` both bound it below by one. `>= 0` bounds nothing, and
  // getting that distinction wrong is not hypothetical: an earlier draft tested the captured number
  // without looking at the operator, and flagged the very guard whose liveness assertion ST-11
  // introduced.
  const bounded = [
    /assert[.]ok\s*[(]\s*([A-Za-z_$][\w$.]*)[.]length\s*(>=?)\s*(\d+)/gu,
    /assert[.]ok\s*[(]\s*([A-Za-z_$][\w$.]*)\s*(>=?)\s*(\d+)/gu,
  ];
  for (const re of bounded) {
    for (const m of code.matchAll(re)) {
      if (m[2] === ">" ? Number(m[3]) >= 0 : Number(m[3]) >= 1) hits.add(m[1]);
    }
  }

  // An exact count is a stronger liveness claim than a bound, provided the count is not zero.
  for (const m of code.matchAll(/assert[.](?:equal|strictEqual)\s*[(]\s*([A-Za-z_$][\w$.]*)[.]length\s*,\s*(\d+)/gu)) {
    if (Number(m[2]) > 0) hits.add(m[1]);
  }
  for (const m of code.matchAll(/assert[.]notEqual\s*[(]\s*([A-Za-z_$][\w$.]*)[.]length\s*,\s*0/gu)) {
    hits.add(m[1]);
  }
  // `assert.ok(x.length, "...")` — a truthy length is a non-zero one.
  for (const m of code.matchAll(/assert[.]ok\s*[(]\s*([A-Za-z_$][\w$.]*)[.]length\s*,/gu)) {
    hits.add(m[1]);
  }
  return hits;
}

/** The accumulators this file asserts empty while proving no collection was ever non-empty. */
export function vacuousVerdicts(code) {
  const acc = accumulators(code);
  const asserted = [...emptyVerdicts(code)].filter((id) => acc.has(id));
  if (asserted.length === 0) return [];
  return livenessAssertions(code).size > 0 ? [] : asserted;
}
