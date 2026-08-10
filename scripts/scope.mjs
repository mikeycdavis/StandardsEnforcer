/**
 * Scope: has an authorised human decided that a standards release governs this repository?
 *
 * M2 established that a repository already adopted cannot make its enforcement disappear. The
 * remaining bypass was simpler and larger: never adopt. Closing it is tempting to do with a
 * detector, and a detector is the wrong instrument — `footprint.mjs` exists and is deliberately
 * incapable of deciding anything.
 *
 *     M3 — Every repository in the governed population has an explicit scope disposition, and the
 *     absence or staleness of that disposition is visible. Automated detection may require review;
 *     it cannot make the disposition.
 *
 * Four properties carry that claim, and each is a way the obvious implementation goes wrong:
 *
 * 1. THE TARGET CANNOT OWN ITS OWN SCOPE.
 *    A `scope: out-of-scope` key in the governed repository is a request, not a decision. The
 *    registry is external, and a registry located inside the tree it governs is refused outright —
 *    the exact parallel to M2's "a gate is not a file in the repository it gates".
 *
 * 2. AN EXCLUSION IS A RECORD, NOT AN ABSENCE.
 *    `OUT_OF_SCOPE` requires a named authorised reviewer, a date, a reason and an evidence basis.
 *    Without a durable negative disposition every portfolio scan either nags forever or starts
 *    reading detector silence as proof the repository is not doing ML.
 *
 * 3. STALENESS IS A CHANGE IN EVIDENCE, NOT THE PASSAGE OF TIME.
 *    An arbitrary 90-day expiry manufactures review churn without adding assurance. What invalidates
 *    a decision is the repository acquiring or losing a *kind* of ML evidence relative to the
 *    footprint that was reviewed.
 *
 * 4. DETECTION NEVER CONFIRMS.
 *    A recorded decision stands on the reviewer's authority. Detection can contradict it. Detection
 *    finding nothing does not renew it, and the payload says so in words rather than implying
 *    freshness by staying quiet.
 *
 * Scope authority is also independent of enforcement authority. A verified enforcement root makes
 * the *check* unavoidable; it does not make a partial detector more certain, and nothing here reads
 * the gate.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const DISPOSITION = { IN_SCOPE: "in-scope", OUT_OF_SCOPE: "out-of-scope" };

/** Outcomes this module can produce. `in-scope`/`out-of-scope` come only from a registry entry. */
export const OUTCOME = {
  IN_SCOPE: "in-scope",
  OUT_OF_SCOPE: "out-of-scope",
  REVIEW_REQUIRED: "review-required",
  REGISTRY_INVALID: "registry-invalid",
};

const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function invalid(why, detail = {}) {
  return { outcome: OUTCOME.REGISTRY_INVALID, why, detail };
}
function review(why, detail = {}) {
  return { outcome: OUTCOME.REVIEW_REQUIRED, why, detail };
}

/**
 * Read and structurally validate a scope registry.
 *
 * JSON rather than YAML: this repository has no YAML parser and will not gain a dependency to read
 * a governance artefact. The registry is machine-written as often as hand-written.
 */
export function loadRegistry(registryPath, { target = null } = {}) {
  if (!registryPath) return invalid("no scope registry was configured, so no repository has a scope disposition");

  // The parallel to M2's first semantic. A registry inside the governed tree is editable by the
  // pull request it governs, which makes it a proposal wearing the costume of a decision.
  if (target) {
    const rel = path.relative(path.resolve(target), path.resolve(registryPath));
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      return invalid(
        `the scope registry at ${registryPath} is inside the repository it governs, so that repository decides ` +
        "whether it is governed. Scope decisions must be held where the governed project cannot write",
      );
    }
  }

  if (!existsSync(registryPath)) return invalid(`the scope registry ${registryPath} does not exist`);
  let doc;
  try {
    doc = JSON.parse(readFileSync(registryPath, "utf8"));
  } catch (e) {
    return invalid(`the scope registry ${registryPath} is not readable JSON (${e.message})`);
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return invalid("the scope registry is not an object");
  if (!doc.repositories || typeof doc.repositories !== "object" || Array.isArray(doc.repositories)) {
    return invalid("the scope registry has no `repositories` map");
  }
  const reviewers = doc.authorisedReviewers;
  if (!Array.isArray(reviewers) || reviewers.length === 0) {
    // Without a trust source every entry is self-asserted, and an entry nobody is accountable for is
    // not a decision. Failing here is better than accepting dispositions signed by no one.
    return invalid("the scope registry lists no `authorisedReviewers`, so no entry in it can be authoritative");
  }
  return { outcome: null, registry: doc, reviewers: new Set(reviewers) };
}

/**
 * Resolve one repository's scope.
 *
 * `repoId` is an immutable platform identity (GitHub's numeric repository id or node id), never a
 * display name: `acme/moneyball` can be renamed, transferred, deleted and recreated by someone else,
 * and a scope decision that follows a name follows whoever holds the name today.
 *
 * `footprint` is `detectFootprint()`'s result and is used for exactly one thing — deciding whether
 * the evidence basis a reviewer recorded still describes this repository.
 */
export function resolveScope({ registryPath, repoId, repoName = null, target = null, footprint, today }) {
  const loaded = loadRegistry(registryPath, { target });
  if (loaded.outcome === OUTCOME.REGISTRY_INVALID) return loaded;
  const { registry, reviewers } = loaded;

  if (!repoId) {
    return invalid("no immutable repository identity was supplied; scope decisions are keyed by identity, not by name");
  }

  const entry = registry.repositories[repoId];
  if (!entry) {
    // A name that matches while the identity does not is worth saying out loud. It is what a rename,
    // a transfer, or a different repository squatting a freed name looks like from here.
    const byName = repoName
      ? Object.entries(registry.repositories).find(([, e]) => e.name === repoName)
      : null;
    if (byName) {
      return review(
        `no scope decision is recorded for identity ${repoId}. An entry (${byName[0]}) carries the name ` +
        `"${repoName}", but a name is not an identity, and treating it as one would let a renamed or ` +
        "recreated repository inherit a decision made about a different one",
        { unreviewed: true, nameCollision: byName[0] },
      );
    }
    return review(
      `no scope decision is recorded for ${repoName ?? repoId}. Whether MachineLearningStandards governs it is ` +
      "unreviewed, and unreviewed is a state to resolve rather than a reason to proceed",
      { unreviewed: true },
    );
  }

  const ml = entry.machineLearning;
  if (!ml || typeof ml !== "object") {
    return review(`the registry entry for ${repoName ?? repoId} records no machine-learning disposition`, { malformed: true });
  }
  if (ml.disposition !== DISPOSITION.IN_SCOPE && ml.disposition !== DISPOSITION.OUT_OF_SCOPE) {
    return review(`the recorded disposition "${ml.disposition}" is not one this enforcer recognises`, { malformed: true });
  }

  const decision = {
    disposition: ml.disposition,
    reviewedBy: ml.reviewedBy ?? null,
    reviewedAt: ml.reviewedAt ?? null,
    reason: ml.reason ?? null,
    evidence: ml.evidence ?? [],
    revisitWhen: ml.revisitWhen ?? [],
    reviewedFootprint: ml.reviewedFootprint ?? null,
    expiresAt: ml.expiresAt ?? null,
  };

  // The socially realistic bypass: whoever wants to avoid the standards records `out-of-scope`
  // themselves. It is a legitimate *proposal* and is reported as one; it is not a disposition.
  if (!decision.reviewedBy || !reviewers.has(decision.reviewedBy)) {
    return review(
      `the disposition "${ml.disposition}" for ${repoName ?? repoId} was recorded by ` +
      `${decision.reviewedBy ? `"${decision.reviewedBy}"` : "nobody"}, who is not an authorised scope reviewer. ` +
      "A proposal to be excluded is not an exclusion",
      { decision, selfAsserted: true },
    );
  }
  if (!decision.reviewedAt || !DATE.test(decision.reviewedAt)) {
    return review(`the disposition for ${repoName ?? repoId} records no review date`, { decision, malformed: true });
  }
  if (!decision.reason) {
    // Applied to both directions. An exclusion with no reason is indistinguishable from an oversight,
    // and an inclusion with no reason cannot be argued with when someone wants it reversed.
    return review(`the disposition for ${repoName ?? repoId} records no reason`, { decision, malformed: true });
  }
  if (decision.expiresAt && DATE.test(decision.expiresAt) && decision.expiresAt < today) {
    // Not a default timer — a bound a reviewer chose to set on their own decision.
    return review(`the scope decision for ${repoName ?? repoId} expired on ${decision.expiresAt}`, { decision, expired: true });
  }

  const basis = decision.reviewedFootprint;
  if (!basis || !Array.isArray(basis.kinds) || typeof basis.digest !== "string") {
    return review(
      `the scope decision for ${repoName ?? repoId} records no evidence basis, so whether it still describes this ` +
      "repository cannot be determined. A decision that cannot go stale cannot be trusted to be fresh",
      { decision, noBasis: true },
    );
  }

  if (basis.digest !== footprint.digest) {
    const before = new Set(basis.kinds);
    const now = new Set(footprint.kinds);
    const gained = footprint.kinds.filter((k) => !before.has(k));
    const lost = basis.kinds.filter((k) => !now.has(k));
    return review(
      `the machine-learning footprint of ${repoName ?? repoId} no longer matches the one reviewed on ` +
      `${decision.reviewedAt}` +
      (gained.length ? `; gained ${gained.join(", ")}` : "") +
      (lost.length ? `; lost ${lost.join(", ")}` : ""),
      { decision, stale: true, gained, lost, reviewedKinds: basis.kinds, observedKinds: footprint.kinds },
    );
  }

  return {
    outcome: ml.disposition === DISPOSITION.IN_SCOPE ? OUTCOME.IN_SCOPE : OUTCOME.OUT_OF_SCOPE,
    why: null,
    detail: {
      decision,
      // Said explicitly on every fresh disposition, and most importantly on exclusions. The decision
      // holds because a named reviewer made it, not because a detector went quiet. Detection only
      // failed to contradict it, over a footprint it admits it cannot see all of.
      standsOn:
        `the review recorded by ${decision.reviewedBy} on ${decision.reviewedAt}. Automated detection did not ` +
        "confirm this decision; it only failed to contradict it, and its coverage is partial",
      revisitWhen: decision.revisitWhen,
    },
  };
}
