/**
 * The single place any git call for discovery lives.
 *
 * [ADR 0007](../artifacts/adr/0007-the-review-surface-is-the-whole-repository.md) defines the
 * reviewed surface as the whole **tracked content** of a repository. This module is the only thing
 * that answers what that content is, so there is exactly one place where "git said nothing" has to be
 * distinguished from "there is nothing".
 *
 * ZERO IS NEVER INFERRED. That is the whole design. An empty result from git is one of the most
 * dangerous values in this system: it produces an empty surface, an empty surface digests to a
 * constant, and a constant matches itself forever. A repository that cannot be read would then hold a
 * permanently-current scope determination reviewed against nothing. So:
 *
 *   - a non-zero exit throws;
 *   - **non-empty stderr throws even when the exit code is 0** — git warns and continues in several
 *     conditions that change what it lists;
 *   - an empty file list is cross-checked against the filesystem, and an empty listing over a
 *     non-empty directory throws `DISCOVERY_INCONSISTENT`.
 *
 * There is deliberately **no code path in this module that returns `[]` on failure.** Not one.
 *
 * WHY THE CROSS-CHECK IS NOT PARANOIA. Eleven of roughly fifty repositories on this machine hit
 * git's dubious-ownership fatal today. `git ls-files` in that condition exits non-zero with an empty
 * stdout — but the same shape is reachable from a corrupt index, a partially-cloned repository, and
 * a path that is not a work tree at all. The cross-check catches the class rather than the instance.
 *
 * `safe.directory` IS PASSED PER INVOCATION, NEVER WRITTEN. `git -c safe.directory=<abs>` applies to
 * one call. `git config --global --add safe.directory` mutates the operator's machine, permanently,
 * and hides the very condition that made it necessary — on that machine, forever, including for
 * every other tool. A tool that silences a warning by editing global state is choosing to make the
 * next investigation harder.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** Directories whose presence does not make a repository non-empty for the cross-check. */
const NOT_CONTENT = new Set([".git"]);

export class GitFactsError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = "GitFactsError";
    this.code = code;
    this.detail = detail;
  }
}

function git(repo, args) {
  const abs = path.resolve(repo);
  const r = spawnSync("git", ["-c", `safe.directory=${abs}`, "-C", abs, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) {
    throw new GitFactsError("GIT_UNAVAILABLE", `git could not be run in ${abs}: ${r.error.message}`);
  }
  if (r.status !== 0) {
    const why = (r.stderr || "").trim().split("\n")[0] || `git exited ${r.status}`;
    throw new GitFactsError("GIT_FAILED", `git ${args[0]} failed in ${abs}: ${why}`, { status: r.status });
  }
  // Exit 0 with warnings on stderr is a real and quiet failure mode: git reports and continues in
  // conditions that change what it lists. Treating a warning as success is how a partial inventory
  // becomes an authoritative one.
  const stderr = (r.stderr || "").trim();
  if (stderr) {
    throw new GitFactsError("GIT_WARNED", `git ${args[0]} succeeded in ${abs} but wrote to stderr: ${stderr.split("\n")[0]}`, { stderr });
  }
  return r.stdout ?? "";
}

/** Does this directory contain anything other than `.git`? Used only to falsify an empty listing. */
function looksEmpty(repo) {
  let entries;
  try {
    entries = readdirSync(repo, { withFileTypes: true });
  } catch (e) {
    throw new GitFactsError("UNREADABLE", `${repo} could not be read to cross-check an empty git listing: ${e.message}`);
  }
  return entries.filter((e) => !NOT_CONTENT.has(e.name)).length === 0;
}

/**
 * Every tracked file, as `(mode, blobSha, path)`.
 *
 * `git ls-files -s -z` reads the **index**, so this is content as git records it — no file I/O, no
 * encoding, and identical on every machine. That last property is the reason for the choice: the
 * family's only other digest reads the working tree as `utf8`, which digests differently under
 * `core.autocrlf`, mangles binaries into U+FFFD, and hashes the literal string `<missing>` for any
 * path that is a directory.
 *
 * Throws rather than returning a partial or empty answer. Callers turn that into `undetermined`.
 */
export function trackedFiles(repo) {
  const abs = path.resolve(repo);
  if (!existsSync(abs)) throw new GitFactsError("NO_REPOSITORY", `${abs} does not exist`);
  if (!existsSync(path.join(abs, ".git"))) {
    throw new GitFactsError("NO_REPOSITORY", `${abs} is not a git repository, so its tracked content cannot be established`);
  }

  const out = git(abs, ["ls-files", "-s", "-z"]);
  const records = out.split("\0").filter((s) => s.length > 0);

  if (records.length === 0) {
    if (!looksEmpty(abs)) {
      throw new GitFactsError(
        "DISCOVERY_INCONSISTENT",
        `git lists no tracked files in ${abs}, but the directory is not empty. An empty surface would ` +
        "digest to a constant and match itself forever, so this is refused rather than reported",
      );
    }
    // A genuinely empty repository. Legitimate, and still not attestable — reviewing nothing is not
    // reviewing. The refusal lives in digest.mjs, where the surface is built.
    return { repo: abs, files: [] };
  }

  const files = records.map((rec) => {
    // "<mode> <blobSha> <stage>\t<path>"
    const tab = rec.indexOf("\t");
    if (tab < 0) throw new GitFactsError("GIT_UNPARSEABLE", `git ls-files produced a record with no path separator: ${JSON.stringify(rec)}`);
    const meta = rec.slice(0, tab).split(/\s+/);
    const filePath = rec.slice(tab + 1);
    if (meta.length < 3) throw new GitFactsError("GIT_UNPARSEABLE", `git ls-files produced an unreadable record: ${JSON.stringify(rec)}`);
    const [mode, blobSha, stage] = meta;
    if (!/^[0-7]{6}$/.test(mode)) throw new GitFactsError("GIT_UNPARSEABLE", `git ls-files produced a non-octal mode: ${mode}`);
    if (!/^[0-9a-f]{40}$/.test(blobSha) && !/^[0-9a-f]{64}$/.test(blobSha)) {
      throw new GitFactsError("GIT_UNPARSEABLE", `git ls-files produced a non-hex object id: ${blobSha}`);
    }
    // Stage != 0 means an unresolved merge. The index holds several versions of the file and there is
    // no single tracked content to digest, so the surface is not reproducible.
    if (stage !== "0") {
      throw new GitFactsError(
        "UNMERGED_INDEX",
        `${filePath} is at merge stage ${stage}, so the repository has no single tracked content to review`,
        { path: filePath, stage },
      );
    }
    return { mode, blobSha, path: filePath };
  });

  return { repo: abs, files };
}

/**
 * What is present but not tracked, and what is tracked but modified.
 *
 * Reported, and participates in **nothing**. A surface with either is `reproducible: false`: the
 * digest describes the index, and a reviewer looking at a dirty tree is not looking at what the
 * digest covers. Silently digesting the index while a reviewer reads a modified working tree would
 * produce an attestation about content nobody saw.
 */
export function worktreeState(repo) {
  const out = git(repo, ["status", "--porcelain", "-z", "--untracked-files=normal"]);
  const records = out.split("\0").filter((s) => s.length > 0);
  const untracked = [];
  const modified = [];
  for (const rec of records) {
    const code = rec.slice(0, 2);
    const p = rec.slice(3);
    if (!p) continue;
    if (code === "??") untracked.push(p);
    else modified.push(p);
  }
  return { untracked, modified, clean: untracked.length === 0 && modified.length === 0 };
}

/**
 * Paths git tracks but whose content this module cannot claim to have covered.
 *
 * Submodules (mode 160000) are a commit pointer, not content. Symlinks (120000) digest as their
 * target string, which is not the thing at the other end. Both are **reported as not covered**
 * rather than silently digested, because a digest that quietly means less than it appears to is the
 * defect this whole slice exists to remove.
 */
export function notCovered(files) {
  return files
    .filter((f) => f.mode === "160000" || f.mode === "120000")
    .map((f) => ({ path: f.path, kind: f.mode === "160000" ? "submodule" : "symlink" }));
}
