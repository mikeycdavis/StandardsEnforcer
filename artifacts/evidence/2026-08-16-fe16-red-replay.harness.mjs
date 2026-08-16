/**
 * FE-16 red replay against current main, unmodified.
 *
 * Five arms, each answered independently. Nothing here is a fixture for a later remedy: the point is
 * to establish whether the proposition is still live against THIS seam, THIS oracle, THIS main.
 */
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.argv[2];
const { runOfficialEvaluator } = await import(`file:///${ROOT.replace(/\\/g, "/")}/scripts/enforce.mjs`);

// A pack that declares a passing status and then completes however the arm requires.
const evaluatorFor = (tail) => `
console.log(JSON.stringify({ status: "COMPLIANT", note: "the pack says it passed" }));
${tail}
`;

const CONTRACT = {
  schemaVersion: "1.1.0",
  standard: { id: "synthetic-fe16" },
  evaluation: { entrypoint: "scripts/standards.mjs", arguments: ["check", "{target}", "--policy", "{policy}"] },
  result: { statuses: ["COMPLIANT", "NON_COMPLIANT", "NOT_EVALUATED"], passing: ["COMPLIANT"] },
};

async function pack(tail) {
  const dir = await mkdtemp(path.join(tmpdir(), "fe16-pack-"));
  await mkdir(path.join(dir, "scripts"), { recursive: true });
  await writeFile(path.join(dir, "standards-adapter.json"), JSON.stringify(CONTRACT));
  await writeFile(path.join(dir, "scripts", "standards.mjs"), evaluatorFor(tail));
  return dir;
}

async function governed() {
  const dir = await mkdtemp(path.join(tmpdir(), "fe16-gov-"));
  await writeFile(path.join(dir, "project-policy.yml"), 'project: "Governed"\n');
  return dir;
}

// Does this platform deliver signals to a child at all? Answered by trying, never by naming the OS.
function signalsAvailable() {
  const r = spawnSync(process.execPath,
    ["-e", 'process.kill(process.pid, "SIGKILL"); setTimeout(() => {}, 5000);'],
    { encoding: "utf8", windowsHide: true });
  return { ok: Boolean(r.signal), status: r.status ?? null, signal: r.signal ?? null };
}

const arms = [
  ["A  passing status + exit 1",  "process.exit(1);"],
  ["B  passing status + exit 42", "process.exit(42);"],
  ["D  passing status + exit 0 (control)", ""],
];

const target = await governed();
const results = [];

for (const [name, tail] of arms) {
  const p = await pack(tail);
  const r = runOfficialEvaluator(p, { target, policyPath: path.join(target, "project-policy.yml") });
  const status = r.report?.status;
  results.push({
    arm: name,
    ok: r.ok,
    exitCode: r.exitCode,
    signalField: "signal" in r ? r.signal : "(field absent from the seam's return)",
    status,
    passingPerContract: status ? CONTRACT.result.passing.includes(status) : null,
    verdictWouldBe: r.ok && CONTRACT.result.passing.includes(status) ? "EVALUATED / passing=true / exit 0" : "not a pass",
  });
  await rm(p, { recursive: true, force: true });
}

// Arm C — signalled termination. Capability-gated, never simulated.
const cap = signalsAvailable();
if (cap.ok) {
  const p = await pack('process.kill(process.pid, "SIGKILL"); setTimeout(() => {}, 5000);');
  const r = runOfficialEvaluator(p, { target, policyPath: path.join(target, "project-policy.yml") });
  const status = r.report?.status;
  results.push({
    arm: "C  passing status + SIGKILL",
    ok: r.ok,
    exitCode: r.exitCode,
    signalField: "signal" in r ? r.signal : "(field absent from the seam's return)",
    status,
    passingPerContract: status ? CONTRACT.result.passing.includes(status) : null,
    verdictWouldBe: r.ok && CONTRACT.result.passing.includes(status) ? "EVALUATED / passing=true / exit 0" : "not a pass",
  });
  await rm(p, { recursive: true, force: true });
} else {
  results.push({
    arm: "C  passing status + SIGKILL",
    notEstablishedLocally: true,
    why: `this platform did not deliver a signal to a child that killed itself: status ${JSON.stringify(cap.status)}, signal ${JSON.stringify(cap.signal)}`,
  });
}

await rm(target, { recursive: true, force: true });
console.log(JSON.stringify({ root: ROOT, node: process.version, platform: process.platform, results }, null, 2));
