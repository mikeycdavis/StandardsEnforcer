/**
 * The diagrams and the prose that quotes them must not drift apart.
 *
 * THE PROPOSITION. `docs/architecture.md` states, in its own words, that the fenced blocks under
 * *Diagrams* are **byte-identical** to `docs/*.mmd`. That was a claim nothing checked. A claim
 * nothing checks is a claim that becomes false the first time somebody edits one of the two copies,
 * and the failure mode is the worst kind: the document still reads as though it were canonical.
 *
 * WHY THIS IS NOT COSMETIC, AND WHY IT ARRIVED WITH THIS CHANGE. The architecture record is what
 * stops a defence being removed later on the grounds that nothing depicts it. The wrong-pack
 * defect this branch fixes added an identity gate *before* adoption vocabulary is consumed, while
 * deliberately leaving R2 at the evaluator seam — two gates, neither redundant, recorded in ADR
 * 0005. If the diagram kept showing the old single-gate flow, a future reader would be entitled to
 * conclude the early gate was an accident and delete it. So the diagram is part of the change, and
 * this file is what keeps the copy in the prose honest about the source it claims to be.
 *
 * WHAT THIS DELIBERATELY DOES NOT CHECK. That `docs/*.svg` is a current render of `docs/*.mmd`.
 * Verifying that needs `@mermaid-js/mermaid-cli` inside the CI image, which means an install step,
 * which the `no-install-invariant` check would then have to learn about. `docs/local-ci.md` records
 * that decision under *Follow-up*, and this file does not quietly reverse it: it asserts only that
 * every canonical source has a rendered companion, which is the part that can be established
 * without a renderer.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs");
const read = (f) => readFileSync(path.join(DOCS, f), "utf8").replace(/\r\n/gu, "\n");

const SOURCES = readdirSync(DOCS).filter((f) => f.endsWith(".mmd")).sort();

/** Every ```mermaid block in the document, in order, with the fences stripped. */
function fencedBlocks(markdown) {
  const out = [];
  const re = /^```mermaid\n([\s\S]*?)\n```$/gmu;
  let m;
  while ((m = re.exec(markdown)) !== null) out.push(m[1]);
  return out;
}

test("diagrams · the repository actually has canonical sources to be checked against", () => {
  // Without this the suite passes vacuously the day someone renames the directory.
  assert.ok(SOURCES.length >= 2,
    `expected the canonical .mmd sources in docs/, found ${JSON.stringify(SOURCES)}`);
});

test("diagrams · each fenced block in architecture.md is byte-identical to its .mmd source", () => {
  const blocks = fencedBlocks(read("architecture.md"));

  assert.equal(blocks.length, SOURCES.length,
    `architecture.md carries ${blocks.length} mermaid blocks for ${SOURCES.length} canonical ` +
    "sources; a block with no source, or a source with no block, is drift either way");

  for (const source of SOURCES) {
    const canonical = read(source).replace(/\n+$/u, "");
    assert.ok(blocks.includes(canonical),
      `docs/${source} does not appear verbatim in architecture.md. The document claims the blocks ` +
      "are byte-identical to these files; regenerate the block from the source rather than " +
      "loosening this assertion");
  }
});

test("diagrams · every canonical source has a rendered companion", () => {
  for (const source of SOURCES) {
    const svg = source.replace(/\.mmd$/u, ".svg");
    assert.ok(existsSync(path.join(DOCS, svg)),
      `docs/${source} has no docs/${svg}; architecture.md links the rendered artifact`);
    assert.match(read(svg).slice(0, 400), /<svg/u, `docs/${svg} is not an SVG`);
  }
});
