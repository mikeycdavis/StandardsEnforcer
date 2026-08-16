/**
 * The backlog tracker's derivation, held to the same standard as everything else here (ST-10).
 *
 * The first test is the one that runs in CI on every commit: the figures in
 * `artifacts/backlog/README.md` must equal the figures computed from `artifacts/backlog/items/*.md`.
 * Everything after it exists to stop that test being decorative.
 *
 * WHY THE MUTATIONS. A reconciliation script that recomputes the same numbers the page already
 * shows will pass forever, including on the day it stops computing anything. "The current numbers
 * match" is not evidence that a wrong number would be caught — it is the same false green ST-10 was
 * filed against, one layer up. So each derived figure is deliberately broken at the source, and the
 * checker must report a disagreement naming that specific figure:
 *
 *     mutate items/ in memory  ──derive──▶  figures that no longer match the real README
 *                                                   │
 *                                            the checker must say so, and say which
 *
 * Two of the mutations are chosen so that only one figure moves while the aggregates stay put — a
 * pair of swapped statuses changes two parent progress tuples and nothing else, and a reopened
 * EP-01 changes the in-flight set and the status counts while leaf completion is untouched. Those
 * are the cases a coarse "do the totals match" check would sail straight past.
 *
 * The mutations never touch disk. The tracker being compared against is the real committed one.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  ITEMS_DIR,
  TRACKER_PATH,
  buildModel,
  checkTracker,
  derive,
  parseFrontmatter,
  readItems,
} from "../scripts/backlog.mjs";

const RECORDS = readItems(ITEMS_DIR);
const TRACKER = fs.readFileSync(TRACKER_PATH, "utf8");

/** Apply a mutation to a private copy of the item records and check the real tracker against it. */
function underMutation(mutate) {
  const records = structuredClone(RECORDS);
  mutate(records, {
    item: (id) => records.find((r) => r.data.id === id).data,
    drop: (id) => records.splice(records.findIndex((r) => r.data.id === id), 1),
    add: (data) => records.push({ file: `${data.id}.md`, data: { opened: "2026-08-16", ...data }, problems: [] }),
  });
  const model = buildModel(records);
  return { problems: model.problems, kinds: checkTracker(derive(model), TRACKER).map((f) => f.kind) };
}

// -------------------------------------------------------------------------------------------
// The check itself
// -------------------------------------------------------------------------------------------

test("backlog · the tracker's figures are the ones the item files imply", () => {
  const model = buildModel(RECORDS);
  assert.deepEqual(model.problems, [], "the item files do not form a well-formed backlog");

  const findings = checkTracker(derive(model), TRACKER);
  assert.deepEqual(
    findings.map((f) => `${f.kind}\n      items/ say : ${f.expected}\n      README says: ${f.actual}`),
    [],
    "artifacts/backlog/README.md disagrees with artifacts/backlog/items/. " +
      "Run `node scripts/backlog.mjs --print` to see what each derived block should say.",
  );
});

test("backlog · the tracker is claimed to be derived, and says how it is checked", () => {
  // The header used to read "GENERATED FILE — re-run the backlog script", and no such script
  // existed. Whatever it claims now has to be true, so it names the thing that actually runs.
  assert.match(TRACKER, /scripts\/backlog\.mjs/u, "the tracker does not name its checker");
  assert.doesNotMatch(TRACKER, /GENERATED FILE/u, "the tracker still claims to be generated");
});

// -------------------------------------------------------------------------------------------
// Mutations — one per derived figure
// -------------------------------------------------------------------------------------------

/**
 * The synthetic ids below are reserved, and this is what makes the reservation real.
 *
 * Every specimen in this file used to be "the next free number" — `IN-02`, `EP-07`, `FE-16`,
 * `ST-11`, `TA-01`. That works exactly until the backlog allocates one, at which point the mutation
 * collides with a real item and the suite fails with `duplicate id`, naming neither the cause nor
 * the fix. It has now happened twice: `FE-16` went to the process-completion work, and `ST-11` to
 * the vacuous-guard repair, which is what surfaced it.
 *
 * `-90` and above is therefore reserved for specimens, and asserted here to be unallocated. A future
 * author who reaches ST-89 gets a failure that says what to do rather than a puzzle to solve.
 */
test("model · the ids reserved for mutation specimens are not allocated to real items", () => {
  const taken = RECORDS.map((r) => r.data.id).filter((id) => /-9\d$/u.test(id ?? ""));
  assert.deepEqual(taken, [],
    "a real backlog item has taken an id reserved for this file's synthetic specimens; renumber " +
    "the item, or move the specimens further out and update this guard with them");
});

test("mutation · a changed item count is caught", () => {
  const { problems, kinds } = underMutation((_records, { add }) =>
    add({ id: "ST-90", type: "story", title: "An item nobody counted", parent: "EP-06", status: "NOT_STARTED" }),
  );
  assert.deepEqual(problems, []);
  assert.ok(kinds.includes("status-total"), `total not caught: ${kinds}`);
  assert.ok(kinds.includes("type-count:story"), `story count not caught: ${kinds}`);
  assert.ok(kinds.includes("tree-membership"), `tree not caught: ${kinds}`);
});

test("mutation · each status count is caught", () => {
  // Every status, in both directions: an item moved out of one bucket and into another must be
  // reported twice, once for the bucket it left and once for the bucket it joined.
  for (const [id, from, to] of [
    ["ST-09", "NOT_STARTED", "IN_PROGRESS"],
    ["EP-04", "IN_PROGRESS", "BLOCKED"],
    ["ST-07", "BLOCKED", "NOT_STARTED"],
    ["FE-01", "COMPLETE", "NOT_STARTED"],
  ]) {
    const { kinds } = underMutation((_r, { item }) => {
      const target = item(id);
      assert.equal(target.status, from, `${id} is no longer ${from}; this mutation needs re-pointing`);
      target.status = to;
      if (to === "COMPLETE") target.closed = "2026-08-16";
      else delete target.closed;
    });
    assert.ok(kinds.includes(`status-count:${from}`), `${id} leaving ${from} not caught: ${kinds}`);
    assert.ok(kinds.includes(`status-count:${to}`), `${id} joining ${to} not caught: ${kinds}`);
  }
});

test("mutation · each hierarchy type count is caught", () => {
  for (const [type, id, parent] of [
    ["initiative", "IN-90", "TH-01"],
    ["epic", "EP-90", "IN-01"],
    ["feature", "FE-90", "EP-04"],
    ["story", "ST-90", "FE-04"],
    ["task", "TA-90", "ST-09"],
  ]) {
    const { problems, kinds } = underMutation((_r, { add }) =>
      add({ id, type, title: `A ${type} the hierarchy table does not know about`, parent, status: "NOT_STARTED" }),
    );
    assert.deepEqual(problems, [], `${id} is not a well-formed item`);
    assert.ok(kinds.includes(`type-count:${type}`), `${type} count not caught: ${kinds}`);
  }

  // The theme row has no addable arm — a second theme would be a second root — so it is broken by
  // retyping the only one, which must be reported as a count change and as a malformed item.
  const { problems, kinds } = underMutation((_r, { item }) => {
    item("TH-01").type = "initiative";
  });
  assert.ok(kinds.includes("type-count:theme"), `theme count not caught: ${kinds}`);
  assert.ok(kinds.includes("type-count:initiative"), `initiative count not caught: ${kinds}`);
  assert.ok(problems.some((p) => /TH-01: type/u.test(p)), `prefix disagreement not reported: ${problems}`);
});

test("mutation · the leaf count and the completion percentage are caught", () => {
  // A new child under an item that already had one: the leaf set grows, the completed count does
  // not, and 12/23 (52%) becomes 12/24 (50%).
  const { problems, kinds } = underMutation((_r, { add }) =>
    add({ id: "FE-90", type: "feature", title: "A second child under EP-04", parent: "EP-04", status: "NOT_STARTED" }),
  );
  assert.deepEqual(problems, []);
  assert.ok(kinds.includes("leaf-completion"), `leaf ratio not caught: ${kinds}`);
  assert.ok(kinds.includes("progress-bar"), `progress bar not caught: ${kinds}`);
  assert.ok(kinds.includes("theme-progress:TH-01"), `theme row not caught: ${kinds}`);
});

test("mutation · a parent progress tuple is caught even when every aggregate is unchanged", () => {
  // The sharp case. One leaf completes under EP-05, one leaf un-completes under EP-06, so the
  // status counts, the leaf ratio, the progress bar, the theme row and the in-flight set are all
  // bit-identical. Only two tuples move. A checker that compares totals sees nothing here.
  //
  // Re-pointed when ST-08 closed. The specimens are chosen for their state, never for their
  // meaning: this needs one NOT_STARTED leaf and one COMPLETE leaf under *different* epics, and the
  // assertions below are what verify the choice still produces the invariance the case is about.
  const { problems, kinds } = underMutation((_r, { item }) => {
    item("FE-11").status = "COMPLETE";
    item("FE-11").closed = "2026-08-16";
    item("ST-10").status = "NOT_STARTED";
    delete item("ST-10").closed;
  });
  assert.deepEqual(problems, []);
  assert.ok(kinds.includes("tree:EP-05"), `EP-05's tuple not caught: ${kinds}`);
  assert.ok(kinds.includes("tree:EP-06"), `EP-06's tuple not caught: ${kinds}`);

  for (const unchanged of ["leaf-completion", "progress-bar", "theme-progress:TH-01", "in-flight-membership"]) {
    assert.ok(!kinds.includes(unchanged), `${unchanged} should not have moved: ${kinds}`);
  }
  for (const status of ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETE"]) {
    assert.ok(!kinds.includes(`status-count:${status}`), `${status} should not have moved: ${kinds}`);
  }
});

test("mutation · the in-flight set is caught even when every status count is unchanged", () => {
  // One item starts, another stops, so the four buckets hold exactly what they held before. What
  // changes is who is on the list somebody reads to decide what to work on.
  const { problems, kinds } = underMutation((_r, { item }) => {
    item("EP-04").status = "NOT_STARTED";
    item("EP-05").status = "IN_PROGRESS";
  });
  assert.deepEqual(problems, []);
  assert.ok(kinds.includes("in-flight-membership"), `in-flight set not caught: ${kinds}`);
  for (const status of ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETE"]) {
    assert.ok(!kinds.includes(`status-count:${status}`), `${status} should not have moved: ${kinds}`);
  }
});

test("mutation · reopening a closed epic moves the parent reporting and leaves leaf completion alone", () => {
  // The transition the tracker has actually seen, twice. A closed epic reopened by owner disposition
  // rather than by its children must change its glyph, the status counts and the in-flight set — and
  // must NOT change leaf completion, because an epic is not a leaf. This is the pair of properties
  // that made those closures legible; if the checker cannot tell them apart it cannot police the next.
  //
  // RE-POINTED from EP-01 to FE-02 on 2026-08-16, because EP-01 was reopened for real (FE-21:
  // authority withheld before the evaluator is invoked). The specimen has to be an item that is
  // actually closed, or the mutation is a no-op and this test passes while asserting nothing — the
  // same rot ST-08's closure exposed in four mutations here.
  //
  // FE-02 rather than another epic, and the reason is the property under test. EP-03 is closed but
  // has no children, so reopening it DOES move leaf completion and would falsify the second half of
  // this test for the right reason. Of the closed items with children, FE-02 is one; "epic" was never
  // what mattered here, "closed and not a leaf" is.
  const { problems, kinds } = underMutation((_r, { item }) => {
    const epic = item("FE-02");
    assert.equal(epic.status, "COMPLETE", "FE-02 is no longer closed; this mutation needs re-pointing");
    epic.status = "IN_PROGRESS";
    delete epic.closed;
  });
  assert.deepEqual(problems, []);
  assert.ok(kinds.includes("tree:FE-02"), `the parent's glyph not caught: ${kinds}`);
  assert.ok(kinds.includes("in-flight-membership"), `in-flight set not caught: ${kinds}`);
  assert.ok(kinds.includes("status-count:COMPLETE"), `complete count not caught: ${kinds}`);
  assert.ok(kinds.includes("status-count:IN_PROGRESS"), `in-progress count not caught: ${kinds}`);
  assert.ok(!kinds.includes("leaf-completion"), `leaf completion must not move for a non-leaf: ${kinds}`);
  assert.ok(!kinds.includes("progress-bar"), `the bar must not move for a non-leaf: ${kinds}`);
});

test("mutation · a title, a glyph and a link are caught, not just the numbers", () => {
  const { kinds } = underMutation((_r, { item }) => {
    item("ST-09").title = "A title the tracker has never seen";
  });
  assert.ok(kinds.includes("tree:ST-09"), `retitle not caught: ${kinds}`);
});

test("mutation · marking an item ready is caught", () => {
  // The one populated arm the committed tracker cannot exercise: it says nothing is marked ready,
  // and nothing is. Without this the "Ready to pick up" section would be checked only in its empty
  // form, which is the state it can never fail in.
  const { kinds } = underMutation((_r, { item }) => {
    item("ST-09").ready = true;
  });
  assert.ok(kinds.some((k) => k.startsWith("ready")), `a marked-ready item not caught: ${kinds}`);
});

// -------------------------------------------------------------------------------------------
// Mutations of the tracker rather than the items
// -------------------------------------------------------------------------------------------

test("mutation · a hand-edited figure in the tracker is caught", () => {
  // The failure ST-10 describes literally: somebody edits items/ and forgets a number, or edits a
  // number and forgets items/. Same disagreement, approached from the other side.
  // The corruptions are computed from the derivation rather than written as literals, so this test
  // cannot quietly stop corrupting anything the day a figure changes. Each `notEqual` below is what
  // enforces that: a substitution that no longer applies is a failure, not a silent pass.
  const derived = derive(buildModel(RECORDS));
  const ep06 = derived.tree.find((e) => e.id === "EP-06").text;

  for (const [label, corrupt] of [
    ["status count", (t) => t.replace(`| ○ Not started | ${derived.byStatus.NOT_STARTED} |`, "| ○ Not started | 99 |")],
    ["total", (t) => t.replace(`| **Total** | **${derived.total}** |`, "| **Total** | **99** |")],
    ["leaf ratio", (t) => t.replace(`**${derived.doneLeaves} of `, "**99 of ")],
    ["type count", (t) => t.replace(`| \`ST-\` | ${derived.byType.story} |`, "| `ST-` | 99 |")],
    ["a progress bar", (t) => t.replace(derived.bar, derived.bar.replace("█", "░"))],
    ["a parent tuple", (t) => t.replace(ep06, ep06.replace(/_\(\d+\/(\d+)\)_/u, "_(99/$1)_"))],
    ["a glyph in the tree", (t) => t.replace(derived.tree.at(-1).text, derived.tree.at(-1).text.replace("○", "●"))],
    ["a dropped in-flight entry", (t) => t.replace(derived.inFlight[0].text, "")],
  ]) {
    const corrupted = corrupt(TRACKER);
    assert.notEqual(corrupted, TRACKER, `the "${label}" corruption did not apply; the tracker's wording moved`);
    assert.ok(checkTracker(derived, corrupted).length > 0, `a corrupted ${label} was not caught`);
  }
});

// -------------------------------------------------------------------------------------------
// The model's own guards
// -------------------------------------------------------------------------------------------

test("model · malformed items are reported rather than skipped", () => {
  const cases = [
    ["a dangling parent", (_r, { item }) => { item("ST-09").parent = "EP-99"; }, /parent EP-99 does not exist/u],
    ["a cycle", (_r, { item }) => { item("TH-01").parent = "ST-09"; }, /not reachable from the root/u],
    ["a duplicate id", (_r, { item }) => { item("ST-09").id = "ST-08"; }, /duplicate id ST-08/u],
    ["completion with no date", (_r, { item }) => { delete item("FE-01").closed; }, /COMPLETE with no closed date/u],
    ["a date with no completion", (_r, { item }) => { item("ST-09").closed = "2026-08-16"; }, /closed date on a/u],
    ["an unknown status", (_r, { item }) => { item("ST-08").status = "ALMOST"; }, /unknown status ALMOST/u],
    ["a missing title", (_r, { item }) => { delete item("ST-08").title; }, /missing title/u],
  ];
  for (const [label, mutate, expected] of cases) {
    const { problems } = underMutation(mutate);
    assert.ok(problems.some((p) => expected.test(p)), `${label} was not reported: ${problems.join(" | ")}`);
  }
});

test("model · the frontmatter reader refuses what it cannot read", () => {
  // A parser that silently drops a line it does not understand turns a malformed item into an
  // absent one, and an absent item is exactly a wrong count that nothing reports.
  const { problems } = parseFrontmatter(
    ["---", "id: ST-99", "type: story", "colour: blue", "  this is not a list entry", "---", ""].join("\n"),
    "ST-99.md",
  );
  assert.ok(problems.some((p) => /unknown frontmatter key colour/u.test(p)), problems.join(" | "));
  assert.ok(problems.some((p) => /unreadable frontmatter line/u.test(p)), problems.join(" | "));

  assert.deepEqual(parseFrontmatter("id: ST-99\n").problems, ["<memory>: no frontmatter block"]);
  assert.deepEqual(parseFrontmatter("---\nid: ST-99\n").problems, ["<memory>: frontmatter is not terminated"]);
});

test("model · block and inline sequences both read", () => {
  const { data, problems } = parseFrontmatter(
    ["---", "id: ST-99", "tags: [a, b]", "evidence:", "  - one.md", "  - 2ab3c4d", "ready: true", "---"].join("\n"),
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(data.tags, ["a", "b"]);
  assert.deepEqual(data.evidence, ["one.md", "2ab3c4d"]);
  assert.equal(data.ready, true);
});
