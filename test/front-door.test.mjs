/**
 * The README's States table must be the vocabulary the code actually has.
 *
 * FE-17. The front door documented the **pre-0.4.0** state model: `COMPLIANT`,
 * `COMPLIANT_WITH_EXCEPTIONS`, `NON_COMPLIANT`, `NOT_EVALUATED` and `BLOCKED_BY_INVARIANT` listed as
 * enforcer states with exits 0/0/1/2/3, and `ENFORCEMENT_ERROR` given as `2` where `exitFor` returns
 * `4`. None of those five exists in `scripts/states.mjs`.
 *
 * That is not documentation debt. ADR 0001 says the enforcer must not know what a pack's verdict
 * *means*, and mapping `NOT_EVALUATED` to `2` kept exactly that meaning here in encoded form — which
 * is why 0.4.0 removed the semantics rather than relocating the strings. A README listing them tells
 * a reader the enforcer interprets verdicts: the precise belief the rewrite exists to make
 * impossible. The wrong exit code is worse than merely stale, because a caller gating on `2` would
 * read "enforcement could not be established" as something else entirely.
 *
 * WHY A TEST AND NOT A CORRECTED PARAGRAPH. The paragraph was correct once. What was missing is
 * anything that notices when it stops being. So this derives the expectation from `states.mjs` — the
 * vocabulary and `exitFor`, never a list restated here — and reads the README as the rendered
 * assertion being checked. Add a state and this fails until the front door says so; change an exit
 * code and it fails until the table agrees. The same shape as the backlog checker (ST-10) and the
 * capability requirement (ST-08), applied to prose.
 *
 * WHAT IT DOES NOT CHECK. Wording, tone, ordering, or whether the surrounding prose is any good.
 * Only that the state names and their exit codes are the ones the code has.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { STATE, EXIT, PASSING, exitFor } from "../scripts/states.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

/**
 * The rows of the States table, as `{ name, exits }`.
 *
 * `exits` is every backticked number in the row's last cell, because one state legitimately projects
 * to two codes depending on what the authority said, and flattening that to a single value would
 * make the table unable to express the one distinction the 0.4.0 model is built on.
 */
function statesTable() {
  const section = README.split(/^## States$/mu)[1];
  assert.ok(section, "README has no `## States` section");

  const rows = [];
  for (const line of section.split(/\r?\n/u)) {
    if (!line.startsWith("|")) {
      if (rows.length > 0) break; // the table ended
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    const name = /^`([A-Z_]+)`$/u.exec(cells[0])?.[1];
    if (!name) continue; // the header row and its `---` separator
    rows.push({ name, exits: [...cells.at(-1).matchAll(/`(\d+)`/gu)].map((m) => Number(m[1])) });
  }
  assert.ok(rows.length > 0, "the States table has no state rows");
  return rows;
}

test("front door · the README documents exactly the states the code has", () => {
  const rows = statesTable();
  const documented = rows.map((r) => r.name);
  const real = Object.values(STATE);

  const invented = documented.filter((n) => !real.includes(n));
  assert.deepEqual(
    invented,
    [],
    "the README lists states scripts/states.mjs does not define: " +
      `${invented.join(", ")}. A reader trusts this table before anything else in the repository, ` +
      "and a state that does not exist teaches an architecture ADR 0001 forbids.",
  );

  const missing = real.filter((n) => !documented.includes(n));
  assert.deepEqual(missing, [], `the README omits real states: ${missing.join(", ")}`);

  assert.equal(new Set(documented).size, documented.length, "a state is listed twice");
});

test("front door · every documented exit code is the one exitFor produces", () => {
  for (const { name, exits } of statesTable()) {
    assert.ok(exits.length > 0, `${name} documents no exit code`);

    if (name === STATE.EVALUATED) {
      // The one state whose code is not a property of the state. It is `0` or `1` according to the
      // pack's own declared passing set, which is a fact about that release rather than about a
      // name this repository could enumerate — so the table must show both, and neither alone.
      assert.deepEqual(
        [...exits].sort(),
        [exitFor(STATE.EVALUATED, true), exitFor(STATE.EVALUATED, false)].sort(),
        "EVALUATED must document both codes: collapsing it to one restores the claim that a state " +
          "name decides whether a merge may proceed",
      );
      continue;
    }

    assert.deepEqual(
      exits,
      [exitFor(name)],
      `${name} is documented as exit ${exits.join("/")}, but exitFor returns ${exitFor(name)}`,
    );
  }
});

test("front door · the projection is the three codes the exit contract defines", () => {
  const real = Object.values(EXIT).sort();
  const block = /```text\r?\n([^`]*?)```/gu;
  const found = [...README.matchAll(block)]
    .map((m) => m[1])
    .filter((t) => /authority/iu.test(t) && /^\s*\d\s/mu.test(t));

  assert.ok(found.length > 0, "the README does not show the exit-code projection anywhere");
  const codes = [...new Set([...found.join("\n").matchAll(/^\s*(\d)\s+\S/gmu)].map((m) => Number(m[1])))];
  assert.deepEqual(
    codes.sort(),
    real,
    `the projection block lists ${codes.join("/")}, and the exit contract is ${real.join("/")}`,
  );
});

test("front door · a passing state is one the code actually treats as passing", () => {
  // The README names OUT_OF_SCOPE as the one non-verdict a merge may proceed on. That sentence is
  // load-bearing and is checked against PASSING rather than trusted, because a second member added
  // to that set without the front door saying so is precisely how "merge may proceed" widens
  // without anyone deciding it.
  const passing = [...PASSING];
  assert.deepEqual(passing, [STATE.OUT_OF_SCOPE], "PASSING widened; the README must say so too");

  for (const state of passing) {
    assert.match(
      README,
      new RegExp(`\`${state}\`[^\\n]*merge may proceed|merge may proceed[^\\n]*\`${state}\``, "u"),
      `${state} may merge without an authority having spoken, and the README does not say it`,
    );
  }
});
