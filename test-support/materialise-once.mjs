/**
 * One `materialise()` call, in its own process, on a wall-clock barrier.
 *
 * FE-15 is a defect between *processes* sharing a cache root, so it cannot be reproduced inside one.
 * Two test files running in parallel are still one machine's worth of luck; two processes released
 * at the same instant are the condition ADR 0006 is about.
 *
 * **This is a timing seam, not a verification seam.** It controls only *when* `materialise()` is
 * entered. It does not stub, wrap, weaken or bypass anything on the identity path: the call below is
 * the ordinary exported function with ordinary arguments, and whatever it decides is what gets
 * printed. A helper that could make verification pass would be a helper that invalidates every arm
 * it appears in.
 *
 *     node test-support/materialise-once.mjs <repo> <sha> <cacheRoot> [barrierEpochMs]
 *
 * Prints one line of JSON: the result, plus the window the call occupied so a caller can prove two
 * materialisations genuinely overlapped rather than merely both succeeding.
 */

import { materialise } from "../scripts/identity.mjs";

const [repo, sha, cacheRoot, barrierArg] = process.argv.slice(2);
const barrier = Number(barrierArg ?? 0);

// Spin rather than sleep: a timer's resolution is the thing being measured against, and being late
// to the barrier is the one failure mode that would quietly turn a contention test into two
// sequential runs that pass for the wrong reason.
while (barrier && Date.now() < barrier) { /* wait for the release instant */ }

const startedAt = Date.now();
const result = materialise(repo, sha, cacheRoot);
const finishedAt = Date.now();

process.stdout.write(JSON.stringify({ ...result, pid: process.pid, startedAt, finishedAt }) + "\n");
