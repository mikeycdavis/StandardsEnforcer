/**
 * ST-21 — a missing or insufficient oracle credential is its own named failure.
 *
 * ci/oracle-credential.sh is the real script the hosted workflow runs. Here it is driven with a stub
 * `git` first on PATH, so each remote answer (success, an authentication refusal, a hidden private
 * repository, a network failure) can be produced without a network and without a credential. The
 * stub also records its argv, which is how "the token never appears in a command line" is observed.
 *
 * The success case comes first and matters as much as the failures: a harness that could not run the
 * script would also see a non-zero exit, so the script is shown able to answer OK.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readSource } from "../test-support/source-scan.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "ci", "oracle-credential.sh");
const SECRET = "ghp_SECRETVALUE0123456789";

async function run({ stderr = "", rc = 0, token = "", fallback = "", remote = "owner/oracle", githubActions = false }) {
  const dir = await mkdtemp(path.join(tmpdir(), "se-cred-"));
  try {
    const argvFile = path.join(dir, "argv.txt");
    const stub = path.join(dir, "git");
    await writeFile(stub, [
      "#!/usr/bin/env bash",
      `printf '%s\\n' "$*" >> "${argvFile.replaceAll("\\", "/")}"`,
      `printf '%s' ${JSON.stringify(stderr)} >&2`,
      `exit ${rc}`,
      "",
    ].join("\n"));
    await chmod(stub, 0o755);
    const env = {
      ...process.env,
      PATH: `${dir}${path.delimiter}${process.env.PATH}`,
      ENFORCER_ORACLE_REMOTE: remote,
      ENFORCER_ORACLE_TOKEN: token,
      ENFORCER_FALLBACK_TOKEN: fallback,
    };
    delete env.GITHUB_ACTIONS;
    if (githubActions) env.GITHUB_ACTIONS = "true";
    const r = spawnSync("bash", [SCRIPT.replaceAll("\\", "/")], { encoding: "utf8", env });
    let argv = "";
    try { argv = await readFile(argvFile, "utf8"); } catch { /* the stub was never called */ }
    return { status: r.status, out: `${r.stdout}${r.stderr}`, argv };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("credential · the script can answer OK, and says which credential it used", async () => {
  const r = await run({ rc: 0, token: SECRET });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /ORACLE-CREDENTIAL-OK/u);
  assert.match(r.out, /ENFORCER_ORACLE_TOKEN \(dedicated secret\)/u);
  assert.match(r.argv, /ls-remote/u, "the stub must have been called, so the probe really ran");
});

test("credential · the github.token fallback is reported by name, never silent (criterion 2)", async () => {
  const r = await run({ rc: 0, token: "", fallback: "ghs_fallback" });
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /FALLBACK \(ENFORCER_ORACLE_TOKEN is not set\)/u);
  assert.match(r.out, /ORACLE-CREDENTIAL-OK/u);
});

for (const [name, stderr] of [
  ["an authentication refusal", "remote: Invalid username or token. Password authentication is not supported.\nfatal: Authentication failed for 'https://github.com/owner/oracle.git/'"],
  ["bad credentials", "remote: Bad credentials\nfatal: unable to access: The requested URL returned error: 401"],
  ["a private repository hidden from the credential", "remote: Repository not found.\nfatal: repository 'https://github.com/owner/oracle.git/' not found"],
]) {
  test(`credential · ${name} is ORACLE-CREDENTIAL-UNAVAILABLE, distinct from an absent oracle or a failed release`, async () => {
    const r = await run({ rc: 128, stderr, token: SECRET });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /ORACLE-CREDENTIAL-UNAVAILABLE/u);
    assert.match(r.out, /not an absent oracle and not an unresolved release/u);
    assert.doesNotMatch(r.out, /ORACLE-REMOTE-UNREACHABLE/u);
    assert.doesNotMatch(r.out, /ORACLE-CREDENTIAL-OK/u);
  });
}

test("credential · a network failure is a different named failure, not a credential one", async () => {
  const r = await run({ rc: 128, stderr: "fatal: unable to access 'https://github.com/owner/oracle.git/': Could not resolve host: github.com", token: SECRET });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /ORACLE-REMOTE-UNREACHABLE/u);
  assert.doesNotMatch(r.out, /ORACLE-CREDENTIAL-UNAVAILABLE/u);
});

test("credential · no credential at all is reported as such and fails when the remote refuses it", async () => {
  const r = await run({ rc: 128, stderr: "fatal: could not read Username for 'https://github.com': terminal prompts disabled" });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /no credential at all/u);
  assert.match(r.out, /ORACLE-CREDENTIAL-UNAVAILABLE/u);
});

test("credential · the token never appears in the git command line or the output", async () => {
  const r = await run({ rc: 128, stderr: "fatal: Authentication failed", token: SECRET });
  assert.ok(r.argv.length > 0, "the stub must have been called");
  assert.ok(!r.argv.includes(SECRET), "the token must not be in git's argv");
  assert.ok(!r.out.includes(SECRET), "the token must not be printed");
});

test("credential · under GitHub Actions the failure is an ::error:: annotation", async () => {
  const r = await run({ rc: 128, stderr: "fatal: Authentication failed", token: SECRET, githubActions: true });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /::error::ORACLE-CREDENTIAL-UNAVAILABLE/u);
  assert.match(r.out, /::add-mask::/u, "the derived header must be masked in the log");
});

test("workflow · the credential step runs before the oracle checkout and is not continue-on-error", async () => {
  const yml = await readSource(new URL("../.github/workflows/ci.yml", import.meta.url));
  const step = yml.indexOf("- name: Check the oracle credential");
  const checkout = yml.indexOf("- name: Obtain the authoritative oracle");
  assert.ok(step > 0 && checkout > step, "the credential step must exist and precede the oracle checkout");
  const body = yml.slice(step, checkout);
  assert.match(body, /bash ci\/oracle-credential\.sh/u);
  assert.match(body, /ENFORCER_ORACLE_TOKEN:\s*\$\{\{\s*secrets\.ENFORCER_ORACLE_TOKEN\s*\}\}/u);
  assert.match(body, /ENFORCER_FALLBACK_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/u);
  assert.doesNotMatch(body.replace(/^\s*#.*$/gmu, ""), /continue-on-error/u, "a refused credential must stop the job");
});
