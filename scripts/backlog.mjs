#!/usr/bin/env node
/**
 * The backlog tracker's derivation, made executable (ST-10).
 *
 * `artifacts/backlog/README.md` claimed to be generated from `artifacts/backlog/items/*.md` and was
 * not. The counts, percentages, progress tuples and in-flight list were maintained by hand, so a
 * stale figure and a derived one looked identical on the surface this project uses to decide what
 * work exists. That is EP-06's property — an assurance surface must establish what it reports —
 * applied to the record of the work itself.
 *
 * WHY A CHECKER AND NOT A GENERATOR. The tracker carries editorial prose the item files do not
 * contain: the "Answers" column, the introductory sentence, the section wording. A generator owns
 * the whole file and that prose becomes generator source; a checker recomputes only what is
 * genuinely derived and leaves the rest alone. The precedent is FinancialStandards'
 * `scripts/inventory.mjs`, which compares rather than derives so two copies cannot silently
 * disagree. If too much of the page later turns out to be mechanical, that is evidence for
 * generation — it is not the starting assumption.
 *
 * WHAT IS DERIVED, AND FROM WHAT. Item frontmatter is the sole source of hierarchy semantics.
 * Parenthood, depth, leafness and completion come from `parent:` and `status:` and from nothing
 * else. The tracker is the rendered assertion being checked; it never tells this module what the
 * shape of the backlog is.
 *
 *     items/*.md frontmatter  ──derive──▶  expected figures
 *                                              │
 *     artifacts/backlog/README.md ────────── compare ──▶ findings
 *
 * Usage:
 *   node scripts/backlog.mjs            check the tracker; exit 1 on any disagreement
 *   node scripts/backlog.mjs --print    print what each derived block should say
 *
 * The verdict that matters is `test/backlog-tracker.test.mjs`, which runs inside authoritative CI.
 * This CLI exists so that a failure is repairable without reading the test output backwards.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const BACKLOG_DIR = path.resolve(HERE, "..", "artifacts", "backlog");
export const ITEMS_DIR = path.join(BACKLOG_DIR, "items");
export const TRACKER_PATH = path.join(BACKLOG_DIR, "README.md");

/** The four statuses, their glyphs, and the order the tracker lists them in. */
export const STATUS_ORDER = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETE"];
export const STATUS_SYMBOL = { NOT_STARTED: "○", IN_PROGRESS: "◑", BLOCKED: "◒", COMPLETE: "●" };
export const STATUS_LABEL = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETE: "Complete",
};

/** In flight means started and not finished. A blocked item is in flight: it is somebody's problem. */
const IN_FLIGHT = new Set(["IN_PROGRESS", "BLOCKED"]);

/** The Extended Agile Hierarchy, in descending order. The prefix is what binds an id to a level. */
export const LEVELS = [
  { type: "theme", prefix: "TH-", label: "Theme" },
  { type: "initiative", prefix: "IN-", label: "Initiative" },
  { type: "epic", prefix: "EP-", label: "Epic" },
  { type: "feature", prefix: "FE-", label: "Feature" },
  { type: "story", prefix: "ST-", label: "Story" },
  { type: "task", prefix: "TA-", label: "Task" },
];

const REQUIRED_KEYS = ["id", "type", "title", "status", "opened"];
const KNOWN_KEYS = new Set([...REQUIRED_KEYS, "parent", "closed", "evidence", "tags", "ready"]);

const BAR_WIDTH = 40;
const THEME_BAR_WIDTH = 14;

// -------------------------------------------------------------------------------------------
// Reading item files
// -------------------------------------------------------------------------------------------

/**
 * The frontmatter subset this repository actually uses: scalars, block sequences, inline sequences.
 *
 * Deliberately not a YAML library — this repository takes no dependencies — and deliberately strict.
 * A line it does not recognise is reported, never skipped: a parser that ignores what it cannot read
 * turns a malformed item into a silently absent one, which is the class of defect this module was
 * written to close.
 */
export function parseFrontmatter(text, name = "<memory>") {
  const problems = [];
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== "---") {
    return { data: {}, problems: [`${name}: no frontmatter block`] };
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    return { data: {}, problems: [`${name}: frontmatter is not terminated`] };
  }

  const data = {};
  let listKey = null;
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (line.trim() === "") continue;

    const listItem = /^\s+-\s+(.*)$/u.exec(line);
    if (listItem) {
      if (!listKey) problems.push(`${name}: list entry with no key on line ${i + 1}`);
      else data[listKey].push(scalar(listItem[1]));
      continue;
    }

    const pair = /^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/u.exec(line);
    if (!pair) {
      problems.push(`${name}: unreadable frontmatter line ${i + 1}: ${line}`);
      listKey = null;
      continue;
    }

    const [, key, rest] = pair;
    if (key in data) problems.push(`${name}: duplicate key ${key}`);
    if (!KNOWN_KEYS.has(key)) problems.push(`${name}: unknown frontmatter key ${key}`);

    if (rest === "") {
      data[key] = [];
      listKey = key;
    } else if (rest.startsWith("[") && rest.endsWith("]")) {
      data[key] = rest
        .slice(1, -1)
        .split(",")
        .map((v) => scalar(v.trim()))
        .filter((v) => v !== "");
      listKey = null;
    } else {
      data[key] = key === "ready" ? rest === "true" : scalar(rest);
      listKey = null;
    }
  }
  return { data, problems };

  function scalar(v) {
    const t = v.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  }
}

/** Every item file, as `{ file, data, problems }`, sorted by filename. */
export function readItems(dir = ITEMS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const { data, problems } = parseFrontmatter(fs.readFileSync(path.join(dir, file), "utf8"), file);
      return { file, data, problems };
    });
}

// -------------------------------------------------------------------------------------------
// The model
// -------------------------------------------------------------------------------------------

/**
 * Turn item records into a hierarchy, reporting every structural problem rather than throwing on the
 * first. A backlog with two roots and a cycle should say so once, not twice in sequence.
 */
export function buildModel(records) {
  const problems = [];
  const byId = new Map();

  for (const { file, data, problems: parseProblems } of records) {
    problems.push(...parseProblems);
    const id = data.id;
    if (!id) {
      problems.push(`${file}: no id`);
      continue;
    }
    if (byId.has(id)) problems.push(`${file}: duplicate id ${id}`);
    if (file !== `${id}.md`) problems.push(`${file}: filename does not match id ${id}`);

    for (const key of REQUIRED_KEYS) {
      if (data[key] === undefined || data[key] === "") problems.push(`${id}: missing ${key}`);
    }
    if (!STATUS_ORDER.includes(data.status)) problems.push(`${id}: unknown status ${data.status}`);

    const level = LEVELS.find((l) => id.startsWith(l.prefix));
    if (!level) problems.push(`${id}: id carries no known hierarchy prefix`);
    else if (level.type !== data.type) {
      problems.push(`${id}: type ${data.type} disagrees with its prefix (${level.type})`);
    }

    // A closed date is what makes a completion auditable. Either half alone is a claim without a
    // date, or a date without a claim.
    if (data.status === "COMPLETE" && !data.closed) problems.push(`${id}: COMPLETE with no closed date`);
    if (data.status !== "COMPLETE" && data.closed) problems.push(`${id}: closed date on a ${data.status} item`);

    byId.set(id, { ...data, file, children: [] });
  }

  const roots = [];
  for (const item of byId.values()) {
    if (!item.parent) {
      roots.push(item.id);
      continue;
    }
    const parent = byId.get(item.parent);
    if (!parent) problems.push(`${item.id}: parent ${item.parent} does not exist`);
    else if (parent.id === item.id) problems.push(`${item.id}: is its own parent`);
    else parent.children.push(item.id);
  }
  for (const item of byId.values()) item.children.sort();

  if (roots.length !== 1) problems.push(`expected exactly one root item, found ${roots.length}: ${roots.join(", ")}`);

  // Reachability doubles as the cycle check: anything not reached from the root is in a cycle or
  // hangs off one, and either way it is absent from every figure below.
  const depth = new Map();
  const walk = (id, d) => {
    if (depth.has(id)) return;
    depth.set(id, d);
    for (const child of byId.get(id).children) walk(child, d + 1);
  };
  for (const root of roots) walk(root, 0);
  for (const id of byId.keys()) {
    if (!depth.has(id)) problems.push(`${id}: not reachable from the root — a cycle, or an orphan`);
  }

  const leavesOf = (id) => {
    const item = byId.get(id);
    if (item.children.length === 0) return [id];
    return item.children.flatMap(leavesOf);
  };

  return { byId, roots, depth, problems, leavesOf };
}

// -------------------------------------------------------------------------------------------
// Derived figures
// -------------------------------------------------------------------------------------------

const pctOf = (done, total) => (total === 0 ? 0 : Math.round((done / total) * 100));
const barOf = (done, total, width) => {
  const filled = total === 0 ? 0 : Math.round((done / total) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
};

/** Everything the tracker asserts mechanically, computed from the model and nothing else. */
export function derive(model) {
  const { byId, roots, depth, leavesOf } = model;
  const ids = [...byId.keys()].sort();

  const leaves = ids.filter((id) => byId.get(id).children.length === 0);
  const doneLeaves = leaves.filter((id) => byId.get(id).status === "COMPLETE");

  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, ids.filter((id) => byId.get(id).status === s).length]));
  const byType = Object.fromEntries(LEVELS.map((l) => [l.type, ids.filter((id) => byId.get(id).type === l.type).length]));

  const themes = roots
    .filter((id) => byId.get(id).type === "theme")
    .sort()
    .map((id) => {
      const themeLeaves = leavesOf(id);
      const done = themeLeaves.filter((l) => byId.get(l).status === "COMPLETE").length;
      return {
        id,
        title: byId.get(id).title,
        done,
        remaining: themeLeaves.length - done,
        pct: pctOf(done, themeLeaves.length),
        bar: barOf(done, themeLeaves.length, THEME_BAR_WIDTH),
      };
    });

  const line = (id) => {
    const item = byId.get(id);
    const indent = "  ".repeat(depth.get(id) ?? 0);
    let tuple = "";
    if (item.children.length > 0) {
      const own = leavesOf(id);
      tuple = ` _(${own.filter((l) => byId.get(l).status === "COMPLETE").length}/${own.length})_`;
    }
    return `${indent}- ${STATUS_SYMBOL[item.status]} **[${id}](./items/${id}.md)** ${item.title}${tuple}`;
  };

  const tree = [];
  const emit = (id) => {
    tree.push({ id, text: line(id) });
    for (const child of byId.get(id).children) emit(child);
  };
  for (const root of [...roots].sort()) emit(root);

  const listLine = (id) => {
    const item = byId.get(id);
    return `- ${STATUS_SYMBOL[item.status]} [${id}](./items/${id}.md) — ${item.title}`;
  };

  const inFlight = ids.filter((id) => IN_FLIGHT.has(byId.get(id).status)).map((id) => ({ id, text: listLine(id) }));

  // "Marked ready" is an explicit mark, not an inference from a parent's state. Nothing currently
  // sets it, and the tracker says so; the mutation suite exercises the populated arm.
  const ready = ids
    .filter((id) => byId.get(id).ready === true && byId.get(id).status === "NOT_STARTED")
    .map((id) => ({ id, text: listLine(id) }));

  const pct = pctOf(doneLeaves.length, leaves.length);

  return {
    total: ids.length,
    byStatus,
    byType,
    leaves: leaves.length,
    doneLeaves: doneLeaves.length,
    pct,
    headline: `**${doneLeaves.length} of ${leaves.length} leaf items complete — ${pct}%**`,
    bar: `${barOf(doneLeaves.length, leaves.length, BAR_WIDTH)}  ${pct}%`,
    themes,
    inFlight,
    ready,
    tree,
  };
}

/** The whole derivation in one call, from a directory of item files. */
export function deriveFrom(dir = ITEMS_DIR) {
  const model = buildModel(readItems(dir));
  return { model, derived: derive(model) };
}

// -------------------------------------------------------------------------------------------
// Reading the tracker back
// -------------------------------------------------------------------------------------------

function sectionsOf(text) {
  const out = new Map([["", []]]);
  let current = "";
  for (const raw of text.split(/\r?\n/u)) {
    const heading = /^##\s+(.*?)\s*$/u.exec(raw);
    if (heading) {
      current = heading[1];
      out.set(current, []);
      continue;
    }
    out.get(current).push(raw);
  }
  return out;
}

const SEPARATOR = /^:?-{3,}:?$/u;

function tableRows(lines) {
  return lines
    .filter((l) => l.trim().startsWith("|"))
    .map((l) => l.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|").map((c) => c.trim()))
    .filter((cells) => !cells.every((c) => SEPARATOR.test(c)))
    .slice(1); // the header row
}

function bulletLines(lines) {
  return lines.filter((l) => /^\s*-\s/u.test(l)).map((l) => l.replace(/\s+$/u, ""));
}

const idOf = (text) => /\]\(\.\/items\/([A-Z]{2}-\d+)\.md\)/u.exec(text)?.[1] ?? null;

// -------------------------------------------------------------------------------------------
// The comparison
// -------------------------------------------------------------------------------------------

/**
 * Compare the tracker against the derivation. Returns a finding per disagreement, each carrying a
 * `kind` naming the specific figure — so a failure says which number is wrong, not merely that the
 * page and the items disagree.
 */
export function checkTracker(derived, trackerText) {
  const findings = [];
  const add = (kind, expected, actual, note) => findings.push({ kind, expected, actual, note });

  const sections = sectionsOf(trackerText);
  const preamble = sections.get("") ?? [];

  // --- headline and progress bar ---
  const headline = preamble.find((l) => /leaf items complete/u.test(l));
  if (headline === undefined) add("leaf-completion", derived.headline, null, "the headline line is missing");
  else if (headline.trim() !== derived.headline) add("leaf-completion", derived.headline, headline.trim());

  const fenceStart = preamble.findIndex((l) => l.trim() === "```");
  const fenceEnd = fenceStart === -1 ? -1 : preamble.indexOf("```", fenceStart + 1);
  const barLines = fenceStart === -1 || fenceEnd === -1 ? [] : preamble.slice(fenceStart + 1, fenceEnd);
  if (barLines.length !== 1) add("progress-bar", derived.bar, barLines.join("\\n"), "expected one bar line");
  else if (barLines[0] !== derived.bar) add("progress-bar", derived.bar, barLines[0]);

  // --- status table: one row per status, plus the total ---
  const statusRows = new Map(tableRows(sections.get("Status") ?? []).map((cells) => [cells[0], cells[1]]));
  for (const status of STATUS_ORDER) {
    const key = `${STATUS_SYMBOL[status]} ${STATUS_LABEL[status]}`;
    const actual = statusRows.get(key);
    const expected = String(derived.byStatus[status]);
    if (actual !== expected) add(`status-count:${status}`, expected, actual ?? null);
  }
  const totalActual = statusRows.get("**Total**");
  const totalExpected = `**${derived.total}**`;
  if (totalActual !== totalExpected) add("status-total", totalExpected, totalActual ?? null);

  // --- hierarchy table: the count column only; the "Answers" column is editorial ---
  const levelRows = new Map(
    tableRows(sections.get("The hierarchy") ?? []).map((cells) => [cells[1].replaceAll("`", ""), cells[2]]),
  );
  for (const level of LEVELS) {
    const actual = levelRows.get(level.prefix);
    const expected = String(derived.byType[level.type]);
    if (actual !== expected) add(`type-count:${level.type}`, expected, actual ?? null);
  }

  // --- progress by theme ---
  const themeRows = new Map(
    tableRows(sections.get("Progress by theme") ?? []).map((cells) => [idOf(cells[0]), cells]),
  );
  for (const theme of derived.themes) {
    const cells = themeRows.get(theme.id);
    const expected = [
      `[${theme.id} ${theme.title}](./items/${theme.id}.md)`,
      `\`${theme.bar}\` ${theme.pct}%`,
      String(theme.done),
      String(theme.remaining),
    ];
    if (!cells) add(`theme-progress:${theme.id}`, expected.join(" | "), null, "the theme row is missing");
    else if (cells.slice(0, 4).join(" | ") !== expected.join(" | ")) {
      add(`theme-progress:${theme.id}`, expected.join(" | "), cells.slice(0, 4).join(" | "));
    }
  }
  for (const id of themeRows.keys()) {
    if (!derived.themes.some((t) => t.id === id)) add("theme-progress", null, id, "a theme row with no theme item");
  }

  // --- the two bullet lists, and the tree ---
  compareList("in-flight", derived.inFlight, bulletLines(sections.get("In flight") ?? []));
  compareList("ready", derived.ready, bulletLines(sections.get("Ready to pick up") ?? []), "_Nothing marked ready._");
  compareList("tree", derived.tree, bulletLines(sections.get("Everything") ?? []));

  return findings;

  /**
   * Membership first, then per-item text. Aligning by id rather than by position means one inserted
   * item reports as one insertion, instead of every line after it reporting as changed.
   */
  function compareList(kind, expected, actualLines, emptyMarker) {
    if (expected.length === 0 && emptyMarker) {
      const body = (sections.get("Ready to pick up") ?? []).map((l) => l.trim()).filter(Boolean);
      if (body.length !== 1 || body[0] !== emptyMarker) add(kind, emptyMarker, body.join(" "));
      return;
    }
    const actual = actualLines.map((text) => ({ id: idOf(text), text }));
    const expectedIds = expected.map((e) => e.id);
    const actualIds = actual.map((a) => a.id);
    if (expectedIds.join(",") !== actualIds.join(",")) {
      add(`${kind}-membership`, expectedIds.join(", "), actualIds.join(", "));
      return;
    }
    for (let i = 0; i < expected.length; i += 1) {
      if (expected[i].text !== actual[i].text) add(`${kind}:${expected[i].id}`, expected[i].text, actual[i].text);
    }
  }
}

// -------------------------------------------------------------------------------------------
// CLI
// -------------------------------------------------------------------------------------------

export function renderBlocks(derived) {
  const out = [];
  out.push(derived.headline, "", "```", derived.bar, "```", "");
  out.push("## Status", "");
  for (const status of STATUS_ORDER) {
    out.push(`| ${STATUS_SYMBOL[status]} ${STATUS_LABEL[status]} | ${derived.byStatus[status]} |`);
  }
  out.push(`| **Total** | **${derived.total}** |`, "");
  out.push("## The hierarchy  (count column)", "");
  for (const level of LEVELS) out.push(`| ${level.label} | \`${level.prefix}\` | ${derived.byType[level.type]} | … |`);
  out.push("", "## Progress by theme", "");
  for (const t of derived.themes) {
    out.push(`| [${t.id} ${t.title}](./items/${t.id}.md) | \`${t.bar}\` ${t.pct}% | ${t.done} | ${t.remaining} |`);
  }
  out.push("", "## In flight", "");
  out.push(...derived.inFlight.map((e) => e.text));
  out.push("", "## Ready to pick up", "");
  out.push(...(derived.ready.length ? derived.ready.map((e) => e.text) : ["_Nothing marked ready._"]));
  out.push("", "## Everything", "");
  out.push(...derived.tree.map((e) => e.text));
  return out.join("\n");
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const { model, derived } = deriveFrom();

  if (model.problems.length > 0) {
    console.error("The item files do not form a well-formed backlog:\n");
    for (const problem of model.problems) console.error(`  ${problem}`);
    console.error("");
    process.exit(1);
  }

  if (process.argv.includes("--print")) {
    console.log(renderBlocks(derived));
    process.exit(0);
  }

  const findings = checkTracker(derived, fs.readFileSync(TRACKER_PATH, "utf8"));
  if (findings.length === 0) {
    console.log(`artifacts/backlog/README.md agrees with items/ — ${derived.total} items, ${derived.doneLeaves}/${derived.leaves} leaves complete.`);
    process.exit(0);
  }

  console.error(`artifacts/backlog/README.md disagrees with items/ in ${findings.length} place(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.kind}${f.note ? `  (${f.note})` : ""}`);
    console.error(`      items/ say : ${f.expected}`);
    console.error(`      README says: ${f.actual}`);
  }
  console.error("\nRun `node scripts/backlog.mjs --print` to see what each derived block should say.");
  process.exit(1);
}
