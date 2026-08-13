/**
 * The portfolio CLI: the ratchet, and the whole matrix.
 *
 *     node scripts/portfolio.mjs --scope-registry=<file> --baseline=<file> [--repos-root=<dir>]
 *                                [--as-of=YYYY-MM-DD] [--require-reviewed] [--json]
 *
 * TWO QUESTIONS, ONE RUN, AND THEY ARE NOT THE SAME QUESTION.
 *
 *     the ratchet   did the governed population change without a governance event?
 *     the matrix    what does the population currently say?
 *
 * The exit code answers the first. It does NOT say the portfolio is in good order, and the report
 * says so in as many words on every run — a table of four hundred unreviewed cells exiting zero is
 * correct here, because this is a report about applicability and not a merge gate. `--require-reviewed`
 * makes the second question binding too, for a caller that wants it to be.
 *
 * EVERY FLAG THIS TOOL HAS EITHER WIDENS THE POPULATION OR MAKES THE RESULT STRICTER. There is no
 * `--only-signalled`, no `--hide-unknown`, no `--summary-only`. `--repos-root` locates checkouts, and
 * locating one can only ever make a cell resolve FURTHER — never pass, because an unobservable
 * surface is `undetermined` and `undetermined` is review-required.
 *
 * AND THERE IS NO `--write`. The baseline is edited by a human. See `scripts/ratchet.mjs`.
 */

import path from "node:path";

import { portfolio, defaultLocator } from "./matrix.mjs";
import { OUTCOME } from "./scope.mjs";
import { EXIT } from "./states.mjs";

const ORDER = [OUTCOME.REVIEW_REQUIRED, OUTCOME.REGISTRY_INVALID, OUTCOME.IN_SCOPE, OUTCOME.OUT_OF_SCOPE];

export function parseArgs(argv) {
  const args = { registryPath: null, baselinePath: null, reposRoot: null, today: null, requireReviewed: false, json: false };
  for (const a of argv) {
    if (a === "--json") args.json = true;
    else if (a === "--require-reviewed") args.requireReviewed = true;
    else if (a.startsWith("--scope-registry=")) args.registryPath = path.resolve(a.slice(17));
    else if (a.startsWith("--baseline=")) args.baselinePath = path.resolve(a.slice(11));
    else if (a.startsWith("--repos-root=")) args.reposRoot = path.resolve(a.slice(13));
    else if (a.startsWith("--as-of=")) args.today = a.slice(8);
    else return { error: `unrecognised argument: ${a}` };
  }
  if (!args.registryPath) return { error: "--scope-registry is required; there is no population without a registry" };
  if (!args.baselinePath) {
    // Not defaulted to "no ratchet". A portfolio run with no baseline is a run with the control
    // switched off, and switching it off must be an explicit act rather than an omission.
    return { error: "--baseline is required; a portfolio run with no ratchet is a report wearing the costume of a control" };
  }
  return { args };
}

function render(r, { requireReviewed }) {
  const out = [];
  if (r.registryInvalid) return `Portfolio: the registry is invalid, so there is no population.\n  ${r.why}\n`;

  out.push(`Portfolio: ${r.counts.cells} cells — ${r.counts.repositories} registered repositories × ${r.counts.packs} registered packs`);
  out.push(`           ${r.counts.observed} of ${r.counts.cells} cells had an observable working copy`);
  out.push("");

  for (const outcome of ORDER) {
    const n = r.counts.byOutcome[outcome] ?? 0;
    out.push(`  ${String(n).padStart(5)}  ${outcome}${outcome === OUTCOME.IN_SCOPE ? "   (governed; this run evaluated nothing)" : ""}`);
  }
  out.push("");

  for (const c of r.cells) {
    out.push(`  ${c.repoName ?? c.repoId} × ${c.contractId}: ${c.outcome}${c.observed ? "" : "  [unobserved]"}`);
    if (c.why) out.push(`      ${c.why}`);
  }
  out.push("");

  if (r.ratchet.findings.length) {
    out.push(`Ratchet: ${r.ratchet.findings.length} finding${r.ratchet.findings.length === 1 ? "" : "s"}. The baseline is edited by a human; this tool never writes it.`);
    for (const f of r.ratchet.findings) out.push(`  ${f.code}\n      ${f.why}`);
  } else {
    out.push("Ratchet: the baseline accounts for every registered cell, and every cell for a baseline row.");
  }
  out.push("");

  // Said on every run, including a clean one. The exit code below is about the ratchet, and a reader
  // who takes it for a portfolio verdict has been told otherwise in the same output.
  out.push("This is an applicability report, not a compliance result. No standard was evaluated here,");
  out.push("and the exit code reports the ratchet — not whether this portfolio is in good order.");
  out.push("The population is the REGISTERED one: a repository nobody registered has no cell at all,");
  out.push("and finding those is repository discovery, which this enforcer does not do.");
  if (requireReviewed) {
    const unreviewed = r.counts.byOutcome[OUTCOME.REVIEW_REQUIRED] ?? 0;
    out.push(`--require-reviewed: ${unreviewed} cell${unreviewed === 1 ? "" : "s"} await review.`);
  }
  return out.join("\n") + "\n";
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    process.stderr.write(
      `portfolio: ${parsed.error}\n\n` +
      "  node scripts/portfolio.mjs --scope-registry=<file> --baseline=<file> [--repos-root=<dir>]\n" +
      "                             [--as-of=YYYY-MM-DD] [--require-reviewed] [--json]\n",
    );
    return EXIT.NOT_ENFORCEABLE;
  }
  const { registryPath, baselinePath, reposRoot, today, requireReviewed, json } = parsed.args;
  const r = portfolio({
    registryPath,
    baselinePath,
    today: today ?? new Date().toISOString().slice(0, 10),
    locate: defaultLocator({ reposRoot }),
  });
  process.stdout.write(json ? JSON.stringify(r, null, 2) + "\n" : render(r, { requireReviewed }));

  if (r.registryInvalid || !r.ok) return EXIT.NOT_ENFORCEABLE;
  if (requireReviewed && (r.counts.byOutcome[OUTCOME.REVIEW_REQUIRED] ?? 0) > 0) return EXIT.NOT_ENFORCEABLE;
  return EXIT.OK;
}

if (process.argv[1]?.endsWith("portfolio.mjs")) {
  main().then((code) => process.exit(code));
}
