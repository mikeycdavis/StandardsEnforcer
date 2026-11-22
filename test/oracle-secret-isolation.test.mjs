/**
 * ST-21 (trust boundary). The dedicated oracle secret never reaches a pull-request path.
 *
 * WHAT THIS GUARDS. `ENFORCER_ORACLE_TOKEN` can read a private standards repository. A pull request
 * controls its own workflow files, every executable in its checkout, and everything `npm test` runs,
 * so a pull-request job that holds the secret hands it to whoever wrote the pull request. Loading one
 * script from the base branch does not help: the same pull request edits the steps around it, and
 * inlining the probe moves the exposure without removing it. The remedy is structural. Pull-request
 * validation uses `github.token` only, labelled and reported. The dedicated secret exists only in a
 * trusted workflow that runs after merge on `main`, whose workflow file and executables both come
 * from the merged revision.
 *
 * WHAT THIS CHECKS, AND WHAT IT CANNOT. It is a static check of this repository's workflow files. It
 * proves that no workflow reachable from a pull request names the secret, and that the one workflow
 * which does name it keeps the trusted shape. It cannot prove how the secret is scoped in repository
 * settings: a pull request can write its own workflow that names the secret, and only an
 * environment-scoped secret restricted to `main` stops that. The owner applies that setting; the
 * authoritative workflow documents it, and this file says plainly that it is not verified here.
 *
 * The YAML reading below is deliberately small (the repository has no YAML dependency): it understands
 * the `on:` block, the `jobs:` block and comments, nothing else. Each shape it must see is proved by a
 * specimen in the liveness test, so a parser that silently saw nothing would fail that test rather
 * than pass the guard.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readSource } from "../test-support/source-scan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = path.join(ROOT, ".github", "workflows");
const SECRET = "ENFORCER_ORACLE_TOKEN";
const TRUSTED = "oracle-authoritative.yml";

const stripYamlComments = (text) => text.split("\n").map((l) => l.replace(/(^|\s)#.*$/u, "$1")).join("\n");
const indentOf = (l) => l.length - l.trimStart().length;
const unquote = (s) => s.trim().replace(/^["']|["']$/gu, "");

/** The events a workflow triggers on, and for `push` the branches it is restricted to (null = any). */
function triggersOf(text) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => /^on\s*:/u.test(l));
  if (i === -1) return { events: [], pushBranches: null, pushKeys: [] };
  const rest = lines[i].replace(/^on\s*:\s*/u, "").trim();
  if (rest) {
    const flow = rest.match(/^\[(.*)\]$/u);
    return { events: (flow ? flow[1].split(",") : [rest]).map(unquote).filter(Boolean), pushBranches: null, pushKeys: [] };
  }
  const block = [];
  for (let j = i + 1; j < lines.length; j += 1) {
    if (lines[j].trim() !== "" && !/^\s/u.test(lines[j])) break;
    block.push(lines[j]);
  }
  const live = block.filter((l) => l.trim() !== "");
  const base = Math.min(...live.map(indentOf));
  const events = [];
  let pushBody = null;
  for (let k = 0; k < block.length; k += 1) {
    const m = block[k].match(/^(\s*)([\w-]+)\s*:/u);
    if (!m || m[1].length !== base) continue;
    events.push(m[2]);
    if (m[2] === "push") {
      pushBody = [];
      for (let n = k + 1; n < block.length; n += 1) {
        if (block[n].trim() !== "" && indentOf(block[n]) <= base) break;
        pushBody.push(block[n]);
      }
    }
  }
  let pushBranches = null;
  const pushKeys = pushBody ? pushBody.map((l) => l.match(/^\s*([\w-]+)\s*:/u)?.[1]).filter(Boolean) : [];
  if (pushBody) {
    const at = pushBody.findIndex((l) => /^\s*branches\s*:/u.test(l));
    if (at !== -1) {
      const inline = pushBody[at].replace(/^\s*branches\s*:\s*/u, "").trim();
      if (inline) {
        pushBranches = inline.replace(/^\[|\]$/gu, "").split(",").map(unquote).filter(Boolean);
      } else {
        pushBranches = [];
        for (let n = at + 1; n < pushBody.length; n += 1) {
          const item = pushBody[n].match(/^\s*-\s*(.+)$/u);
          if (!item) break;
          pushBranches.push(unquote(item[1]));
        }
      }
    }
  }
  return { events, pushBranches, pushKeys };
}

/** Each job's text, keyed by job id. */
function jobsOf(text) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => /^jobs\s*:/u.test(l));
  if (i === -1) return {};
  const jobs = {};
  let current = null;
  for (let j = i + 1; j < lines.length; j += 1) {
    const l = lines[j];
    if (l.trim() !== "" && !/^\s/u.test(l)) break;
    const m = l.match(/^ {2}([\w-]+)\s*:\s*$/u);
    if (m) { current = m[1]; jobs[current] = []; continue; }
    if (current) jobs[current].push(l);
  }
  return Object.fromEntries(Object.entries(jobs).map(([k, v]) => [k, v.join("\n")]));
}

const TRUSTED_IF = "github.event_name == 'push' && github.ref == 'refs/heads/main'";

/**
 * The violations in one workflow file. An empty list is the only passing answer.
 *
 * The secret is searched for in the RAW text, comments and block scalars included, and
 * case-insensitively: GitHub secret names are case-insensitive, and Actions evaluates the expression
 * syntax even inside a shell comment in a `run:` block or inside a quoted string, so stripping
 * comments before this search would let exactly those spellings through. The cost is that a comment
 * naming the secret is also a violation, which is the safe direction. Structure (triggers, jobs) is
 * read from the comment-stripped text.
 */
function violationsIn(name, rawText) {
  const raw = rawText.replaceAll("\r\n", "\n");
  const text = stripYamlComments(raw);
  const out = [];
  const { events, pushBranches, pushKeys } = triggersOf(text);
  const namesSecret = new RegExp(`\\b${SECRET}\\b`, "iu").test(raw);
  const broad = /\bsecrets\s*:\s*inherit\b|toJSON\s*\(\s*secrets\s*\)|\bsecrets\s*\[|\$\{\{(?:(?!\}\})[\s\S])*?\bsecrets\b(?!\s*\.)/iu.test(raw);
  // YAML double-quoted scalars decode \x.. \u.... and a backslash-newline continuation BEFORE Actions
  // evaluates an expression, so a backslash can spell the secret name or the `${{` itself. No workflow
  // here needs one; refusing every backslash closes the whole class rather than chasing spellings.
  if (raw.includes("\\")) out.push(`${name}: contains a backslash, which YAML escapes could use to hide the secret name`);
  const pushOnly = events.length === 1 && events[0] === "push";

  if (events.length === 0) out.push(`${name}: no readable \`on:\` block, so its triggers could not be established`);
  if ((namesSecret || broad) && !pushOnly) {
    out.push(`${name}: reaches the dedicated secret on a non-push trigger (${events.join(", ") || "unknown"})`);
  }
  if (broad) out.push(`${name}: passes secrets wholesale (secrets: inherit / toJSON(secrets) / secrets[...])`);
  if (namesSecret && name !== TRUSTED) out.push(`${name}: names ${SECRET}; only ${TRUSTED} may`);

  if ((namesSecret || broad) && pushOnly) {
    if (!pushBranches || pushBranches.length !== 1 || pushBranches[0] !== "main") {
      out.push(`${name}: the push trigger must be restricted to exactly [main] (found ${JSON.stringify(pushBranches)})`);
    }
    const extra = pushKeys.filter((k) => k !== "branches");
    if (extra.length > 0) out.push(`${name}: the push trigger carries extra filters (${extra.join(", ")}); only branches: [main] is accepted`);
    if (/pull_request|head_ref/u.test(text)) out.push(`${name}: a secret-holding workflow must not reference pull-request context`);
    const jobs = jobsOf(text);
    if (Object.keys(jobs).length === 0) out.push(`${name}: no readable jobs`);
    for (const [id, body] of Object.entries(jobs)) {
      const env = body.match(/^ {4}environment\s*:\s*(\S+)\s*$/mu);
      if (!env) out.push(`${name}: job ${id} declares no environment, so the secret is not scoped`);
      else if (env[1] !== "oracle-authoritative") out.push(`${name}: job ${id} uses environment ${env[1]}, not oracle-authoritative`);
      const guard = body.match(/^ {4}if\s*:\s*(.+)$/mu);
      if (!guard || guard[1].trim() !== TRUSTED_IF) out.push(`${name}: job ${id} does not carry the exact main-only guard (found ${guard ? guard[1].trim() : "none"})`);
      for (const ref of body.matchAll(/^\s+ref\s*:\s*(.+)$/gmu)) {
        if (!/^\$\{\{\s*github\.sha\s*\}\}$/u.test(ref[1].trim())) out.push(`${name}: job ${id} checks out ${ref[1].trim()}, not the merged revision`);
      }
    }
  }
  return out;
}

test("isolation · no workflow reachable from a pull request can reach the dedicated secret, and the trusted one keeps its shape", async () => {
  const files = (await readdir(WORKFLOWS)).filter((f) => /\.ya?ml$/u.test(f));
  assert.ok(files.length > 0, "no workflow files were found, so nothing was checked");
  assert.ok(files.includes("ci.yml"), "the pull-request workflow must exist, or this guard is checking nothing");
  assert.ok(files.includes(TRUSTED), `${TRUSTED} must exist: it is where the authoritative oracle run lives`);
  const violations = [];
  for (const f of files) violations.push(...violationsIn(f, await readSource(path.join(WORKFLOWS, f))));
  assert.deepEqual(violations, []);
});

test("isolation · ci.yml triggers on pull requests and holds only the github.token mode", async () => {
  const text = stripYamlComments(await readSource(path.join(WORKFLOWS, "ci.yml")));
  assert.ok(triggersOf(text).events.includes("pull_request"), "ci.yml is the pull-request path");
  assert.ok(!text.includes(SECRET) && !/\bsecrets\./u.test(text), "the pull-request workflow must not reference any secret");
  assert.ok(!text.includes("ENFORCER_REQUIRE_DEDICATED"), "only the trusted workflow may demand the dedicated credential");
  assert.match(text, /ENFORCER_FALLBACK_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/u, "the fallback mode must be the explicit, reported one");
});

test("isolation · the trusted post-merge path reports credential mode and failures through the named probe, before the oracle is obtained", async () => {
  const text = stripYamlComments(await readSource(path.join(WORKFLOWS, TRUSTED)));
  const probe = text.indexOf("bash ci/oracle-credential.sh");
  const checkout = text.indexOf("name: Obtain the authoritative oracle");
  assert.ok(probe > 0 && checkout > probe, "the probe must exist and precede the oracle checkout");
  const probeStep = text.slice(text.lastIndexOf("- name:", probe), probe);
  assert.doesNotMatch(probeStep, /continue-on-error/u, "a refused credential must stop the job");
  assert.doesNotMatch(probeStep, /^\s*if\s*:/mu, "the probe must run even with the remote variable unset, so exit 3 is reachable");
  assert.match(probeStep, /ENFORCER_REQUIRE_DEDICATED:\s*'1'/u, "the trusted run must fail, by name, when the dedicated credential is missing");
  assert.match(probeStep, new RegExp(`${SECRET}:\\s*\\$\\{\\{\\s*secrets\\.${SECRET}\\s*\\}\\}`, "u"));
  // The secret may be named by the probe step and the oracle checkout, and by nothing after them:
  // `npm ci` and the check list run code from the merged tree, still without the secret in env.
  const afterCheckout = text.slice(text.indexOf("name: Install pinned dependencies"));
  assert.ok(!afterCheckout.includes(SECRET) && !/\bsecrets\./u.test(afterCheckout), "no step after the oracle checkout may receive the secret");
});

test("isolation · no executable in this repository other than the probe reads the dedicated secret", async () => {
  const offenders = [];
  for (const dir of ["ci", "scripts", "test-support"]) {
    const entries = await readdir(path.join(ROOT, dir), { recursive: true, withFileTypes: true });
    assert.ok(entries.length > 0, `${dir}/ is empty or missing, so nothing was checked there`);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const file = path.join(entry.parentPath ?? entry.path, entry.name);
      const rel = path.relative(ROOT, file).replaceAll("\\", "/");
      if (rel === "ci/oracle-credential.sh") continue;
      if ((await readSource(file)).toUpperCase().includes(SECRET)) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], "only ci/oracle-credential.sh may read the dedicated secret from the environment");
});

test("isolation · the guard can see a violation, so its silence means something", () => {
  const pr = (extra) => `name: x\non:\n  pull_request:\n  push:\n    branches: [main]\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo\n${extra}`;
  const trusted = (over = {}) => [
    "name: t",
    "on:",
    "  push:",
    `    branches: ${over.branches ?? "[main]"}`,
    ...(over.extraOn ?? []),
    "jobs:",
    "  job:",
    "    runs-on: ubuntu-latest",
    ...(over.environment === false ? [] : ["    environment: oracle-authoritative"]),
    ...(over.guard === false ? [] : ["    if: github.event_name == 'push' && github.ref == 'refs/heads/main'"]),
    "    steps:",
    `      - uses: actions/checkout@v4`,
    ...(over.ref ? [`        with:`, `          ref: ${over.ref}`] : []),
    `      - run: echo`,
    `        env:`,
    `          ${SECRET}: \${{ secrets.${SECRET} }}`,
    ...(over.after ?? []),
    "",
  ].join("\n");

  // the trusted shape is clean, or none of the rejections below prove anything
  assert.deepEqual(violationsIn(TRUSTED, trusted()), [], "the trusted specimen must pass");
  assert.deepEqual(violationsIn(TRUSTED, trusted({ ref: "${{ github.sha }}" })), []);
  assert.deepEqual(violationsIn("ci.yml", pr("")), [], "a pull-request workflow with no secret must pass");

  const inheritShape = "name: t\non:\n  push:\n    branches: [main]\njobs:\n  job:\n    runs-on: x\n    uses: ./.github/workflows/y.yml\n    secrets: inherit\n";
  const flagged = [
    ["a pull-request workflow naming the secret", violationsIn("ci.yml", pr(`        env:\n          ${SECRET}: \${{ secrets.${SECRET} }}\n`)), /non-push trigger/u],
    ["the secret under `|| github.token`", violationsIn("ci.yml", pr(`      - with:\n          token: \${{ secrets.${SECRET} || github.token }}\n`)), /non-push trigger/u],
    ["a lower-case spelling of the secret", violationsIn("ci.yml", pr("      - run: echo ${{ secrets.enforcer_oracle_token }}\n")), /non-push trigger/u],
    ["a mixed-case spelling of the secret", violationsIn("ci.yml", pr("      - run: echo ${{ secrets.Enforcer_Oracle_Token }}\n")), /non-push trigger/u],
    ["the secret inside a run: comment line", violationsIn("ci.yml", pr("      - run: |\n          # ${{ secrets.ENFORCER_ORACLE_TOKEN }}\n          echo hi\n")), /non-push trigger/u],
    ["the secret after a # inside a quoted string", violationsIn("ci.yml", pr(`      - run: echo "x #" \${{ secrets.${SECRET} }}\n`)), /non-push trigger/u],
    ["a comment that merely names the secret (conservative on purpose)", violationsIn("ci.yml", pr(`      # ${SECRET} is deliberately not used here\n`)), /non-push trigger/u],
    ["a flow-style trigger list including pull_request", violationsIn(TRUSTED, trusted().replace(/on:\n {2}push:\n {4}branches: \[main\]/u, "on: [push, pull_request]")), /non-push trigger/u],
    ["a scalar pull_request trigger", violationsIn(TRUSTED, trusted().replace(/on:\n {2}push:\n {4}branches: \[main\]/u, "on: pull_request")), /non-push trigger/u],
    ["workflow_dispatch added to the trusted workflow", violationsIn(TRUSTED, trusted({ extraOn: ["  workflow_dispatch:"] })), /non-push trigger/u],
    ["pull_request_target added", violationsIn(TRUSTED, trusted({ extraOn: ["  pull_request_target:"] })), /non-push trigger/u],
    ["push to more than main", violationsIn(TRUSTED, trusted({ branches: "[main, dev]" })), /exactly \[main\]/u],
    ["push with no branch restriction", violationsIn(TRUSTED, trusted().replace("    branches: [main]\n", "")), /exactly \[main\]/u],
    ["push with branches-ignore", violationsIn(TRUSTED, trusted().replace("    branches: [main]\n", "    branches: [main]\n    branches-ignore: [x]\n")), /extra filters/u],
    ["push with tags", violationsIn(TRUSTED, trusted().replace("    branches: [main]\n", "    branches: [main]\n    tags: ['*']\n")), /extra filters/u],
    ["no environment on the secret-holding job", violationsIn(TRUSTED, trusted({ environment: false })), /declares no environment/u],
    ["the wrong environment", violationsIn(TRUSTED, trusted().replace("environment: oracle-authoritative", "environment: staging")), /not oracle-authoritative/u],
    ["no main guard on the job", violationsIn(TRUSTED, trusted({ guard: false })), /exact main-only guard \(found none\)/u],
    ["a weakened main guard", violationsIn(TRUSTED, trusted().replace("if: github.event_name == 'push' && github.ref == 'refs/heads/main'", "if: always() || github.ref == 'refs/heads/main'")), /exact main-only guard/u],
    ["a checkout of something other than the merged revision", violationsIn(TRUSTED, trusted({ ref: "${{ github.event.pull_request.head.sha }}" })), /not the merged revision|pull-request context/u],
    ["the secret in a workflow that is not the trusted one", violationsIn("other.yml", trusted()), /only oracle-authoritative\.yml may/u],
    ["secrets: inherit in a pull-request workflow", violationsIn("ci.yml", pr("      - uses: ./.github/workflows/x.yml\n        secrets: inherit\n")), /wholesale/u],
    ["secrets: inherit in a push-only workflow", violationsIn(TRUSTED, inheritShape), /wholesale/u],
    ["secrets: inherit in a push-only workflow also lacks the environment", violationsIn(TRUSTED, inheritShape), /declares no environment/u],
    ["toJSON(secrets)", violationsIn("ci.yml", pr("      - run: echo '${{ toJSON(secrets) }}'\n")), /wholesale/u],
    ["a bare secrets context in an expression", violationsIn("ci.yml", pr("      - run: echo ${{ format('{0}', secrets) }}\n")), /wholesale/u],
    ["a YAML escape inside an expression", violationsIn("ci.yml", pr('      - run: echo "${{ secrets.ENFORCER_ORACLE_\\x54OKEN }}"\n')), /backslash/u],
    ["an escaped opening brace", violationsIn("ci.yml", pr('      - run: echo "$\\x7b{ secrets.ENFORCER_ORACLE_\\x54OKEN }}"\n')), /backslash/u],
    ["a double-quoted line continuation", violationsIn("ci.yml", pr('      - run: echo "${{ secrets.ENFORCER_ORACLE_\\\n          TOKEN }}"\n')), /backslash/u],
    ["an escaped spelling of secrets in a pull-request workflow", violationsIn("ci.yml", pr('      - run: echo "${{ sec\\x72ets.X }}"\n')), /backslash/u],
    ["dynamic secrets[...] access", violationsIn("ci.yml", pr("      - run: echo ${{ secrets['ENFORCER' + '_X'] }}\n")), /wholesale/u],
    ["a block-style branch list with another branch", violationsIn(TRUSTED, trusted().replace("    branches: [main]\n", "    branches:\n      - main\n      - release\n")), /exactly \[main\]/u],
  ];
  for (const [what, found, rule] of flagged) {
    assert.ok(found.length > 0, `not flagged: ${what}`);
    assert.ok(found.some((m) => rule.test(m)), `flagged, but not by the rule meant to catch it: ${what}\n${found.join("\n")}`);
  }

  // a block-style [main] is read, not missed
  assert.deepEqual(violationsIn(TRUSTED, trusted().replace("    branches: [main]\n", "    branches:\n      - main\n")), []);
});
