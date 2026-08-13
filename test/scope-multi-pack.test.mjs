/**
 * FE-12: the applicability unit is *repository × standards pack*, and no pack is privileged in code.
 *
 * WHAT WENT WRONG. `resolveScope` read `entry.machineLearning` — one hardcoded key — and named
 * MachineLearningStandards in its own prose. A repository in scope for one standard and out of scope
 * for another could not be expressed at all, and the EngineeringStandards adoption on 2026-08-11 had
 * to record its `IN_SCOPE` decision in an evidence document because the registry the enforcer reads
 * had nowhere to put it. The registry *format* was already pack-shaped; only the reader was not.
 *
 * THE BAR, from the item, and it is not "it works for engineering":
 *
 *   Done is that adding a pack requires no change here at all. If the implementation ends up with a
 *   list of known pack ids, the abstraction has not been built.
 *
 * So nothing below names a real pack except as opaque data. The pack ids used here are invented —
 * `alpha-standards`, `beta-standards` — precisely because a test that used the real ones could pass
 * against an implementation that special-cased them.
 *
 * DETECTION IS NOT MADE MULTI-PACK BY THIS, AND MUST NOT LOOK AS IF IT WERE. `footprint.mjs` detects
 * one evidence surface. Making scope multi-pack does not give every pack a detector, and ADR 0004 is
 * clear that detection decides nothing regardless. A decision's evidence basis therefore names the
 * surface it was reviewed against, and a basis naming a surface the enforcer did not compute is
 * `review-required` — not fresh, and not stale, but undetermined. A pack with no detector is not a
 * pack whose detector found nothing.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveScope, OUTCOME } from "../scripts/scope.mjs";
import { SURFACE } from "../scripts/footprint.mjs";

const REVIEWER = "governance@acme.example";
const OTHER_REVIEWER = "j.okafor@acme.example";
const ID = "github:1024871";
const TODAY = "2026-08-12";

/** The evidence surface the enforcer actually computes, as the enforcer reports it. */
const surfaces = (kinds = ["training-call-shape"], digest = "d0") => ({ [SURFACE]: { kinds, digest } });

const basis = (kinds = ["training-call-shape"], digest = "d0", surface = SURFACE) => ({ surface, kinds, digest });

const decision = (over = {}) => ({
  disposition: "in-scope",
  reviewedBy: REVIEWER,
  reviewedAt: "2026-08-01",
  reason: "Recorded by a named reviewer, with a reason, as every disposition must be.",
  evidence: ["src/train.py"],
  revisitWhen: [],
  reviewedFootprint: basis(),
  expiresAt: null,
  ...over,
});

async function withRegistry(standards, fn, { reviewers = [REVIEWER, OTHER_REVIEWER] } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "scope-multi-"));
  try {
    const p = path.join(dir, "scope-registry.json");
    await writeFile(p, JSON.stringify({
      schemaVersion: "1.0.0",
      authorisedReviewers: reviewers,
      repositories: { [ID]: { name: "acme/moneyball", standards } },
    }, null, 2));
    return await fn(p);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const resolve = (registryPath, standardId, footprints = surfaces()) =>
  resolveScope({ registryPath, repoId: ID, repoName: "acme/moneyball", standardId, footprints, today: TODAY });

// ===========================================================================
// The falsifier the item specified
// ===========================================================================

test("one repository carries independent simultaneous dispositions for two packs", async () => {
  // The whole feature in one assertion. Against the hardcoded reader this could not even be
  // expressed: the second pack's disposition was unreadable, because only one key was consulted.
  await withRegistry(
    {
      "alpha-standards": decision({
        disposition: "in-scope",
        reviewedBy: REVIEWER,
        reason: "Trains and evaluates models against a held-out split.",
      }),
      "beta-standards": decision({
        disposition: "out-of-scope",
        reviewedBy: OTHER_REVIEWER,
        reviewedAt: "2026-08-05",
        reason: "Places no wagers and prices no markets, so no rule in the release has a subject here.",
      }),
    },
    (registryPath) => {
      const alpha = resolve(registryPath, "alpha-standards");
      const beta = resolve(registryPath, "beta-standards");

      assert.equal(alpha.outcome, OUTCOME.IN_SCOPE, alpha.why ?? "");
      assert.equal(beta.outcome, OUTCOME.OUT_OF_SCOPE, beta.why ?? "");

      // Each disposition carries its own reviewer, date and reason — not a shared one.
      assert.equal(alpha.detail.decision.reviewedBy, REVIEWER);
      assert.equal(beta.detail.decision.reviewedBy, OTHER_REVIEWER);
      assert.notEqual(alpha.detail.decision.reason, beta.detail.decision.reason);
    },
  );
});

test("a pack with no recorded disposition is review-required, not covered by another pack's", async () => {
  // The failure this guards is a repository inheriting an unrelated standard's decision because one
  // disposition happened to be on file. Silence about a pack is a question, never an answer.
  await withRegistry({ "alpha-standards": decision() }, (registryPath) => {
    const r = resolve(registryPath, "gamma-standards");
    assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
    assert.match(r.why, /gamma-standards/, "the reason must name the pack that has no decision");
  });
});

test("resolving without naming a standard is refused rather than defaulted", async () => {
  // There is no default pack. A caller that forgets to say which standard is asking has not asked a
  // question that has an answer, and answering it anyway is how one pack becomes privileged again.
  await withRegistry({ "alpha-standards": decision() }, (registryPath) => {
    const r = resolveScope({ registryPath, repoId: ID, standardId: null, footprints: surfaces(), today: TODAY });
    assert.equal(r.outcome, OUTCOME.REGISTRY_INVALID);
  });
});

test("an unreviewed repository's reason names the standard that is asking", async () => {
  // It used to say "whether MachineLearningStandards governs it is unreviewed" for every pack,
  // including packs that are not MachineLearningStandards.
  await withRegistry({}, async (registryPath) => {
    const dir = await mkdtemp(path.join(tmpdir(), "scope-empty-"));
    try {
      const empty = path.join(dir, "scope-registry.json");
      await writeFile(empty, JSON.stringify({
        schemaVersion: "1.0.0",
        authorisedReviewers: [REVIEWER],
        repositories: {},
      }));
      const r = resolve(empty, "delta-standards");
      assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
      assert.match(r.why, /delta-standards/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// Detection stays single-surface, and says so rather than pretending
// ===========================================================================

test("a disposition reviewed against a surface the enforcer did not compute is undetermined", async () => {
  // NOT stale and NOT fresh. The enforcer cannot compare a basis it has no observation for, and
  // "cannot determine" is the honest outcome — the same discipline as INV-E1 one layer over.
  await withRegistry(
    { "alpha-standards": decision({ reviewedFootprint: basis(["contract-tests"], "x1", "wagering-evidence") }) },
    (registryPath) => {
      const r = resolve(registryPath, "alpha-standards");
      assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
      assert.match(r.why, /wagering-evidence/, "the reason must name the surface that could not be checked");
      assert.equal(r.detail.unobservedSurface, "wagering-evidence");
    },
  );
});

test("a basis that names no surface at all is refused", async () => {
  // The pre-FE-12 basis shape had no `surface` key, because there was only ever one. Accepting it by
  // assuming the surface would be the enforcer deciding which evidence a reviewer had in mind.
  await withRegistry(
    { "alpha-standards": decision({ reviewedFootprint: { kinds: ["training-call-shape"], digest: "d0" } }) },
    (registryPath) => {
      const r = resolve(registryPath, "alpha-standards");
      assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
      assert.equal(r.detail.noBasis, true);
    },
  );
});

test("staleness still bites, per pack, against the surface actually named", async () => {
  // Generalising the key must not cost the staleness property M3 was built on.
  await withRegistry({ "alpha-standards": decision({ reviewedFootprint: basis(["training-call-shape"], "d0") }) },
    (registryPath) => {
      const fresh = resolve(registryPath, "alpha-standards", surfaces(["training-call-shape"], "d0"));
      assert.equal(fresh.outcome, OUTCOME.IN_SCOPE, fresh.why ?? "");

      const moved = resolve(registryPath, "alpha-standards", surfaces(["training-call-shape", "dataset-artifact"], "d1"));
      assert.equal(moved.outcome, OUTCOME.REVIEW_REQUIRED);
      assert.equal(moved.detail.stale, true);
      assert.deepEqual(moved.detail.gained, ["dataset-artifact"]);
    });
});

test("one pack's stale decision does not disturb another pack's fresh one", async () => {
  // Independence has to hold under failure, not only under success. A shared staleness verdict would
  // be the hardcoded key returning in a subtler form.
  await withRegistry(
    {
      "alpha-standards": decision({ reviewedFootprint: basis(["training-call-shape"], "d0") }),
      "beta-standards": decision({ disposition: "out-of-scope", reviewedFootprint: basis(["training-call-shape"], "STALE") }),
    },
    (registryPath) => {
      const alpha = resolve(registryPath, "alpha-standards", surfaces(["training-call-shape"], "d0"));
      const beta = resolve(registryPath, "beta-standards", surfaces(["training-call-shape"], "d0"));

      assert.equal(alpha.outcome, OUTCOME.IN_SCOPE, alpha.why ?? "");
      assert.equal(beta.outcome, OUTCOME.REVIEW_REQUIRED);
      assert.equal(beta.detail.stale, true);
    },
  );
});

// ===========================================================================
// The properties M3 established, asserted once per pack rather than once
// ===========================================================================

test("a self-asserted disposition is a proposal for every pack, not just the first one", async () => {
  await withRegistry(
    { "beta-standards": decision({ disposition: "out-of-scope", reviewedBy: "the-repository-owner@acme.example" }) },
    (registryPath) => {
      const r = resolve(registryPath, "beta-standards");
      assert.equal(r.outcome, OUTCOME.REVIEW_REQUIRED);
      assert.equal(r.detail.selfAsserted, true);
    },
  );
});

test("adding a pack requires no change to the enforcer, which is the actual acceptance test", async () => {
  // Five packs the enforcer has never heard of, resolved in one pass. If any of them needed the
  // enforcer to know something about it, this fails — and if the implementation ever grows a list of
  // known ids, this is the test that keeps passing while the abstraction is gone, so it is paired
  // with the source guard in `authority-boundary.test.mjs` rather than trusted alone.
  const invented = ["one-standards", "two-standards", "three-standards", "four-standards", "five-standards"];
  const entries = Object.fromEntries(
    invented.map((id, i) => [id, decision({ disposition: i % 2 ? "out-of-scope" : "in-scope", reason: `Decided for ${id}.` })]),
  );
  await withRegistry(entries, (registryPath) => {
    const outcomes = invented.map((id) => resolve(registryPath, id).outcome);
    assert.deepEqual(outcomes, [
      OUTCOME.IN_SCOPE, OUTCOME.OUT_OF_SCOPE, OUTCOME.IN_SCOPE, OUTCOME.OUT_OF_SCOPE, OUTCOME.IN_SCOPE,
    ]);
  });
});
