/**
 * Does this checkout still hand its credential to whatever runs next?
 *
 * THE EXPOSURE THIS EXISTS TO CATCH. The hosted workflow checks out the private standards oracle
 * with a token, and the very next step runs `npm test` — code the pull request under test wrote.
 * `actions/checkout` defaults to `persist-credentials: true`, which writes the credential into the
 * checked-out repository's own git configuration. So the default arrangement is: fetch a secret,
 * leave it on disk, then execute untrusted code beside it. The token would be scoped and read-only
 * and still readable by exactly the thing it must be protected from.
 *
 * FE-14 named the requirement; this is the part that establishes it.
 *
 * WHY NOT `grep` FOR THE TOKEN. Because the token is not what is stored. `actions/checkout` writes
 * an `http.<url>.extraheader` of `AUTHORIZATION: basic <base64>`, so a check for the literal secret
 * finds nothing and reports clean while the credential sits three feet away, base64-encoded. A test
 * that passes for the wrong reason is worse than no test, and this repository has shipped one
 * before. The property is therefore about the MECHANISM, not about a string:
 *
 *     no subsequent git operation in this checkout may obtain a credential from
 *     repository-local git configuration
 *
 * WHY `git config --local --list` RATHER THAN READING `.git/config`. The file is one source of the
 * configuration and not the whole of it: `include.path` pulls in other files, and the on-disk
 * spelling of a key is not the resolved key. Asking git resolves both, and it is git's own answer
 * about what git would use. Reading the file would be this module deciding what the file means.
 *
 * Three mechanisms are refused, because a credential can persist as any of them:
 *
 *   http.<url>.extraheader   what actions/checkout actually writes
 *   a remote URL with userinfo   https://x-access-token:<token>@github.com/... — the credential IS
 *                                the URL, and it travels anywhere the remote is used
 *   credential.helper (local)    a local helper is a local instruction about where to get secrets
 *
 * Absence of these establishes that the local configuration carries no credential. It does not
 * establish that no credential exists anywhere on the machine — a global helper, an agent, or the
 * environment are all out of this module's reach, and it says so rather than implying otherwise.
 *
 *     node ci/credential-hygiene.mjs [--require] [--outcome-file=<path>] <name>=<path> [...]
 *
 * Exit 0 means every named checkout is clean. Any other exit code means it is not, or that the
 * question could not be answered — an unreadable repository is a refusal, never a pass, because
 * INV-E1 does not permit an unknown to resolve in the permissive direction.
 *
 * WHAT THE STAGE ESTABLISHED IS NOT WHAT A CHECKOUT IS. Local container CI has no credential-bearing
 * checkout at all: the source is baked into the image and the oracle is a read-only bind mount, so
 * neither is a clone. The first version of this stage discovered its subjects by looking for `.git`,
 * found none, printed a line, and completed successfully — reporting a stage as passed while the
 * property it exists to establish went entirely unexercised. That is ST-08's shape and ST-11's, one
 * layer up: nothing skipped, nothing asserted, and a green line either way.
 *
 * So the stage outcome is separate, explicit, and carried into the CI evidence:
 *
 *     local container   NOT_EXERCISED   no credential-bearing checkout exists in this environment
 *     hosted Actions    ESTABLISHED     every required subject inspected, every one CLEAN
 *
 * `--require` is the environment's claim about itself — the same shape as ENFORCER_REQUIRE_ORACLE
 * and ENFORCER_REQUIRE_SYMLINKS, and never a count of anything. Under it the invariant is:
 *
 *     a run that possesses an oracle credential may not reach the test suite unless credential
 *     hygiene was ESTABLISHED on every checkout that could retain that credential
 *
 * REQUIRED SUBJECTS ARE NAMED, NOT COUNTED. "at least one directory contained a `.git`" is satisfied
 * by a workflow that stopped cloning the oracle: the credential-bearing subject vanishes from the
 * observation set and the stage still passes, which is the same false green wearing a different
 * coat. Under `--require` the subjects below must each be present by name and each be CLEAN.
 */

import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/** What a persisted credential can look like in local configuration. */
export const MECHANISM = {
  EXTRAHEADER: "http-extraheader",
  URL_USERINFO: "remote-url-userinfo",
  CREDENTIAL_HELPER: "local-credential-helper",
};

export const HYGIENE = {
  /** The local configuration carries no credential by any mechanism this module knows. */
  CLEAN: "CLEAN",
  /** At least one credential-bearing mechanism is present. */
  PERSISTED: "PERSISTED",
  /** The question could not be answered. Never a pass. */
  UNREADABLE: "UNREADABLE",
};

/**
 * Why a checkout was UNREADABLE. Carried separately from the state so that "there is no clone here"
 * and "there is a clone here and git would not answer about it" stay distinguishable — the first is
 * an ordinary fact about local CI, the second is a refusal. Under `--require` the distinction buys
 * nothing and is not consulted: anything that is not CLEAN is a failure there.
 */
export const REASON = {
  ABSENT: "absent",
  NOT_A_REPOSITORY: "not-a-repository",
  UNREADABLE: "unreadable",
};

/** What the credential-hygiene STAGE established, as distinct from what one checkout is. */
export const STAGE = {
  /** Every required subject was inspected and every one was clean. */
  ESTABLISHED: "ESTABLISHED",
  /** No checkout in this environment could be carrying a credential. Not a pass; an honest absence. */
  NOT_EXERCISED: "NOT_EXERCISED",
  /** A subject retained a credential, could not be read, or was never inspected at all. */
  FAILED: "FAILED",
};

/** The checkouts that can retain the oracle credential on a hosted run. Named, so one cannot silently leave. */
export const SUBJECT = {
  WORKSPACE: "workspace-checkout",
  ORACLE: "oracle-checkout",
};

export const REQUIRED_SUBJECTS = [SUBJECT.WORKSPACE, SUBJECT.ORACLE];

const runGit = (args, cwd) => spawnSync("git", args, { encoding: "utf8", cwd, windowsHide: true });

/**
 * Parse `git config --local --list` output into findings.
 *
 * Exported so the test can drive it with recorded shapes — including the exact one
 * `actions/checkout` produces — without needing a real authenticated checkout to exist.
 */
export function findingsIn(configList) {
  const findings = [];
  for (const line of String(configList).split("\n")) {
    if (!line.trim()) continue;
    const eq = line.indexOf("=");
    const key = (eq === -1 ? line : line.slice(0, eq)).trim().toLowerCase();
    const value = eq === -1 ? "" : line.slice(eq + 1);

    // `http.<anything>.extraheader`. Matched on the shape of the key rather than on a known URL,
    // because the host in the middle is whatever was cloned and a fixed list would miss the next one.
    if (key.startsWith("http.") && key.endsWith(".extraheader")) {
      findings.push({ mechanism: MECHANISM.EXTRAHEADER, key, why: "an Authorization header is configured for this repository, which is how actions/checkout persists a token" });
      continue;
    }

    // A remote whose URL carries userinfo. Checked before the scheme is assumed: `@` also appears in
    // scp-style ssh remotes (`git@github.com:owner/repo`), which are not credentials, so the match
    // requires a `//` and userinfo ahead of the host.
    if (/^remote\..+\.url$/.test(key)) {
      const m = /^[a-z][a-z0-9+.-]*:\/\/([^/@]+)@/i.exec(value.trim());
      if (m && m[1].includes(":")) {
        findings.push({ mechanism: MECHANISM.URL_USERINFO, key, why: "the remote URL embeds credentials, so anything using this remote carries them" });
      }
      continue;
    }

    if (key === "credential.helper") {
      findings.push({ mechanism: MECHANISM.CREDENTIAL_HELPER, key, why: "a repository-local credential helper tells git where to obtain secrets for this checkout" });
    }
  }
  return findings;
}

/**
 * Inspect one checkout.
 *
 * Returns `{ state, findings, why }`. A directory that is not a git repository is `UNREADABLE`
 * rather than `CLEAN`: "there is no configuration here" and "I could not read the configuration"
 * are different answers, and only one of them is evidence.
 */
export function inspect(dir) {
  if (!existsSync(dir)) {
    return { state: HYGIENE.UNREADABLE, reason: REASON.ABSENT, findings: [], why: `${dir} does not exist` };
  }
  if (!existsSync(path.join(dir, ".git"))) {
    return { state: HYGIENE.UNREADABLE, reason: REASON.NOT_A_REPOSITORY, findings: [], why: `${dir} is not a git repository, so it has no local configuration to clear` };
  }

  const listed = runGit(["config", "--local", "--list"], dir);
  // Exit 1 with no output is git's answer for "no local configuration set", which is a real answer
  // and the cleanest possible one. Any other failure is not an answer at all.
  if (listed.status !== 0 && (listed.stdout ?? "").trim() !== "") {
    return { state: HYGIENE.UNREADABLE, reason: REASON.UNREADABLE, findings: [], why: `git could not read local configuration in ${dir}: ${(listed.stderr || "").trim().split("\n")[0] || `exit ${listed.status}`}` };
  }
  if (listed.status !== 0 && listed.status !== 1) {
    return { state: HYGIENE.UNREADABLE, reason: REASON.UNREADABLE, findings: [], why: `git exited ${listed.status} reading local configuration in ${dir}` };
  }

  const findings = findingsIn(listed.stdout ?? "");
  return {
    state: findings.length === 0 ? HYGIENE.CLEAN : HYGIENE.PERSISTED,
    reason: null,
    findings,
    why: findings.length === 0 ? null : `${dir} retains ${findings.length} credential-bearing configuration ${findings.length === 1 ? "entry" : "entries"}`,
  };
}

/**
 * What did the stage establish, given what was inspected?
 *
 * Pure, and separated from `inspect` so both directions can be driven from a test without arranging
 * a hosted runner: the interesting case is precisely the one that cannot be reproduced locally.
 *
 * `subjects` is `[{ name, dir, state, reason }]` — the full list the caller was asked to inspect,
 * including subjects that turned out not to exist. A caller that filters the list before calling
 * this has already thrown away the only evidence that a required subject went missing.
 */
export function decideStage({ required, subjects }) {
  const list = subjects ?? [];

  if (required) {
    const present = new Set(list.map((s) => s.name));
    const missing = REQUIRED_SUBJECTS.filter((n) => !present.has(n));
    if (missing.length > 0) {
      return {
        outcome: STAGE.FAILED,
        subjects: list,
        why:
          `credential hygiene is required in this environment, but ${missing.join(" and ")} was not among ` +
          `the inspected subjects. A subject that leaves the observation set is a subject nobody checked.`,
      };
    }
    const bad = list.filter((s) => s.state !== HYGIENE.CLEAN);
    if (bad.length > 0) {
      return {
        outcome: STAGE.FAILED,
        subjects: list,
        why:
          `credential hygiene is required in this environment, and ${bad.map((s) => `${s.name} is ${s.state}`).join("; ")}. ` +
          `A run holding an oracle credential must not reach the test suite until every checkout that could ` +
          `retain it is clean.`,
      };
    }
    return {
      outcome: STAGE.ESTABLISHED,
      subjects: list,
      why: `every checkout that could retain the oracle credential was inspected by name and is clean`,
    };
  }

  // Unclaimed environment. A checkout that is genuinely retaining a credential is still the exposure
  // this exists to stop, so it is red here too; what the absence of the claim changes is that the
  // absence of a checkout is reported as absence rather than as success.
  const persisted = list.filter((s) => s.state === HYGIENE.PERSISTED);
  if (persisted.length > 0) {
    return {
      outcome: STAGE.FAILED,
      subjects: list,
      why: `${persisted.map((s) => s.name).join(", ")} retains a credential where the code under test could read it`,
    };
  }
  const unreadable = list.filter((s) => s.state === HYGIENE.UNREADABLE && s.reason === REASON.UNREADABLE);
  if (unreadable.length > 0) {
    return {
      outcome: STAGE.FAILED,
      subjects: list,
      why: `${unreadable.map((s) => s.name).join(", ")} is a checkout whose configuration could not be read, and an unanswered question is not a clean one`,
    };
  }

  const inspected = list.filter((s) => s.state === HYGIENE.CLEAN);
  return {
    outcome: STAGE.NOT_EXERCISED,
    subjects: list,
    why:
      inspected.length === 0
        ? `no credential-bearing checkout exists in this environment (the source is baked into the image; the oracle is bind-mounted read-only)`
        : `${inspected.length} checkout(s) inspected and clean, but no checkout here was handed a credential, ` +
          `so the hosted property is not established by this run`,
  };
}

function main(argv) {
  const required = argv.includes("--require");
  const outcomeFile = argv.find((a) => a.startsWith("--outcome-file="))?.slice("--outcome-file=".length);
  const args = argv.filter((a) => !a.startsWith("--"));
  if (args.length === 0) {
    process.stderr.write("usage: node ci/credential-hygiene.mjs [--require] [--outcome-file=<path>] <name>=<checkout> [...]\n");
    return 2;
  }

  // `<name>=<path>`; a bare path is its own name, for ad-hoc use from a shell.
  const subjects = args.map((a) => {
    const eq = a.indexOf("=");
    const name = eq === -1 ? a : a.slice(0, eq);
    const dir = eq === -1 ? a : a.slice(eq + 1);
    const r = inspect(dir);
    return { name, dir, state: r.state, reason: r.reason, findings: r.findings, why: r.why };
  });

  for (const s of subjects) {
    if (s.state === HYGIENE.CLEAN) {
      process.stdout.write(`  clean          ${s.name}  ${s.dir} — no credential in repository-local git configuration\n`);
      continue;
    }
    if (s.state === HYGIENE.UNREADABLE) {
      process.stdout.write(`  ${required ? "MISSING       " : "not a checkout"} ${s.name}  ${s.dir} — ${s.why}\n`);
      continue;
    }
    process.stdout.write(`  PERSISTED      ${s.name}  ${s.dir} — ${s.why}\n`);
    for (const f of s.findings) {
      process.stdout.write(`                 ${f.key}  (${f.mechanism})\n`);
      process.stdout.write(`                 ${f.why}\n`);
    }
    process.stdout.write("                 Set persist-credentials: false on the checkout that produced it.\n");
  }

  const decision = decideStage({ required, subjects });
  process.stdout.write(`\n  credential-hygiene: ${decision.outcome}\n`);
  process.stdout.write(`  ${decision.why}\n`);
  if (decision.outcome === STAGE.FAILED && subjects.some((s) => s.state === HYGIENE.PERSISTED)) {
    process.stdout.write("  Set persist-credentials: false on the checkout that produced it.\n");
  }
  // Said plainly rather than left implied: a clean result is about this configuration only.
  process.stdout.write("  scope: repository-local git configuration only; global helpers, agents and the environment are out of reach here\n");

  if (outcomeFile) {
    try {
      writeFileSync(outcomeFile, `${decision.outcome}\n${decision.why}\n`);
    } catch (error) {
      // The stage's own verdict must not depend on being able to file a report about it.
      process.stdout.write(`  (could not write ${outcomeFile}: ${error.message})\n`);
    }
  }

  return decision.outcome === STAGE.FAILED ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("credential-hygiene.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
