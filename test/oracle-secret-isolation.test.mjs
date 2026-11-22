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
  if (i === -1) return { events: [], pushBranches: null };
  const rest = lines[i].replace(/^on\s*:\s*/u, "").trim();
  if (rest) {
    const flow = rest.match(/^\[(.*)\]$/u);
    return { events: (flow ? flow[1].split(",") : [rest]).map(unquote).filter(Boolean), pushBranches: null };
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
  return { events, pushBranches };
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

/** The violations in one workflow file. An empty list is the only passing answer. */
function violationsIn(name, rawText) {
  const text = stripYamlComments(rawText.replaceAll("\r\n", "\n"));
  const out = [];
  const { events, pushBranches } = triggersOf(text);
  const namesSecret = new RegExp(`\\b${SECRET}\\b`, "u").test(text);
  const broad = /\bsecrets\s*:\s*inherit\b|toJSON\s*\(\s*secrets\s*\)|\bsecrets\s*\[/u.test(text);
  const pushOnly = events.length === 1 && events[0] === "push";

  if (events.length === 0) out.push(`${name}: no readable \`on:\` block, so its triggers could not be established`);
  if ((namesSecret || broad) && !pushOnly) {
    out.push(`${name}: reaches the dedicated secret on a non-push trigger (${events.join(", ") || "unknown"})`);
  }
  if (broad && name !== TRUSTED) out.push(`${name}: passes secrets wholesale (secrets: inherit / toJSON(secrets) / secrets[...])`);
  if (namesSecret && name !== TRUSTED) out.push(`${name}: names ${SECRET}; only ${TRUSTED} may`);

  if (namesSecret && pushOnly) {
    if (!pushBranches || pushBranches.length !== 1 || pushBranches[0] !== "main") {
      out.push(`${name}: the push trigger must be restricted to exactly [main] (found ${JSON.stringify(pushBranches)})`);
    }
    if (/pull_request|head_ref/u.test(text)) out.push(`${name}: a secret-holding workflow must not reference pull-request context`);
    const jobs = jobsOf(text);
    if (Object.keys(jobs).length === 0) out.push(`${name}: no readable jobs`);
    for (const [id, body] of Object.entries(jobs)) {
      if (!/^\s{4}environment\s*:\s*\S/mu.test(body)) out.push(`${name}: job ${id} declares no environment, so the secret is not scoped`);
      if (!/^\s{4}if\s*:.*github\.ref\s*==\s*'refs\/heads\/main'/mu.test(body)) out.push(`${name}: job ${id} does not refuse to run off refs/heads/main`);
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
  assert.match(text, /ENFORCER_FALLBACK_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/u, "the fallback mode must be the explicit, reported one");
});

test("isolation · the trusted post-merge path reports credential mode and failures through the named probe, before the oracle is obtained", async () => {
  const text = stripYamlComments(await readSource(path.join(WORKFLOWS, TRUSTED)));
  const probe = text.indexOf("bash ci/oracle-credential.sh");
  const checkout = text.indexOf("name: Obtain the authoritative oracle");
  assert.ok(probe > 0 && checkout > probe, "the probe must exist and precede the oracle checkout");
  const probeStep = text.slice(text.lastIndexOf("- name:", probe), probe);
  assert.doesNotMatch(probeStep, /continue-on-error/u, "a refused credential must stop the job");
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
      if ((await readSource(file)).includes(SECRET)) offenders.push(rel);
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

  const flagged = [
    ["a pull-request workflow naming the secret", violationsIn("ci.yml", pr(`        env:\n          ${SECRET}: \${{ secrets.${SECRET} }}\n`))],
    ["the secret under `|| github.token`", violationsIn("ci.yml", pr(`      - with:\n          token: \${{ secrets.${SECRET} || github.token }}\n`))],
    ["a flow-style trigger list including pull_request", violationsIn(TRUSTED, trusted().replace(/on:\n {2}push:\n {4}branches: \[main\]/u, "on: [push, pull_request]"))],
    ["a scalar pull_request trigger", violationsIn(TRUSTED, trusted().replace(/on:\n {2}push:\n {4}branches: \[main\]/u, "on: pull_request"))],
    ["workflow_dispatch added to the trusted workflow", violationsIn(TRUSTED, trusted({ extraOn: ["  workflow_dispatch:"] }))],
    ["pull_request_target added", violationsIn(TRUSTED, trusted({ extraOn: ["  pull_request_target:"] }))],
    ["push to more than main", violationsIn(TRUSTED, trusted({ branches: "[main, dev]" }))],
    ["push with no branch restriction", violationsIn(TRUSTED, trusted().replace("    branches: [main]\n", ""))],
    ["no environment on the secret-holding job", violationsIn(TRUSTED, trusted({ environment: false }))],
    ["no main guard on the job", violationsIn(TRUSTED, trusted({ guard: false }))],
    ["a checkout of something other than the merged revision", violationsIn(TRUSTED, trusted({ ref: "${{ github.event.pull_request.head.sha }}" }))],
    ["the secret in a workflow that is not the trusted one", violationsIn("other.yml", trusted())],
    ["secrets: inherit", violationsIn("ci.yml", pr("      - uses: ./.github/workflows/x.yml\n        secrets: inherit\n"))],
    ["toJSON(secrets)", violationsIn("ci.yml", pr("      - run: echo '${{ toJSON(secrets) }}'\n"))],
    ["a block-style branch list", violationsIn(TRUSTED, trusted().replace("    branches: [main]\n", "    branches:\n      - main\n      - release\n"))],
  ];
  for (const [what, found] of flagged) assert.ok(found.length > 0, `not flagged: ${what}`);

  // a block-style [main] is read, not missed
  assert.deepEqual(violationsIn(TRUSTED, trusted().replace("    branches: [main]\n", "    branches:\n      - main\n")), []);
  // a comment naming the secret is prose, not a reference
  assert.deepEqual(violationsIn("ci.yml", pr(`      # ${SECRET} is deliberately not used here\n`)), []);
});
