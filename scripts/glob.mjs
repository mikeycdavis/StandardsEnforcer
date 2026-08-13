/**
 * A deliberately small glob subset, for exclusion globs only.
 *
 * [ADR 0007](../artifacts/adr/0007-the-review-surface-is-the-whole-repository.md) makes an exclusion
 * an affirmative, reasoned narrowing of what was reviewed. A glob is therefore a **governance
 * artefact**, and the property that matters is not expressiveness — it is that a reviewer and this
 * code agree on what it matched.
 *
 * AN UNSUPPORTED CONSTRUCT IS A HARD ERROR, NEVER A SILENT NON-MATCH. That is the entire reason this
 * file exists instead of a dependency or a hand-rolled `RegExp`. `src/{a,b}/**` under a matcher
 * without brace expansion matches nothing — so the exclusion silently covers no files, the surface is
 * silently wider than the reviewer believed, and the digest is a perfectly valid digest of the wrong
 * thing. Every failure of this kind is invisible and reads as success. Refusing to compile is the
 * only outcome a reviewer can act on.
 *
 * Supported, and nothing else:
 *
 *     **        any number of path segments, including none
 *     *         any run of characters within one segment
 *     ?         exactly one character within one segment
 *     [abc]     one character from a set; [a-z] ranges; [!abc] / [^abc] negated
 *     trailing/ a directory: `vendor/` means `vendor/**`
 *
 * Explicitly refused: `{a,b}` brace expansion, leading `!` negation, `+(…)`/`@(…)` extglobs,
 * backslash escapes (a path separator here is always `/`), and absolute or `..`-bearing patterns.
 */

const SEP = "/";

export class GlobError extends Error {
  constructor(pattern, why) {
    super(`the exclusion glob ${JSON.stringify(pattern)} ${why}`);
    this.name = "GlobError";
    this.pattern = pattern;
    this.why = why;
  }
}

function refuse(pattern, why) {
  throw new GlobError(pattern, why);
}

/**
 * Compile one glob to a matcher over `/`-separated repository-relative paths.
 *
 * Returns `{ pattern, test(path) }`. Compilation is where every refusal happens, so a caller that
 * holds a compiled glob is holding one whose meaning was agreed.
 */
export function compileGlob(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) {
    refuse(String(pattern), "is not a non-empty string");
  }
  if (pattern.includes("\\")) {
    refuse(pattern, "contains a backslash; repository paths here are always /-separated, and an escape would be ambiguous");
  }
  if (pattern.startsWith("/")) refuse(pattern, "is absolute; exclusions are relative to the repository root");
  if (pattern.split(SEP).includes("..")) refuse(pattern, "contains `..`, which could exclude paths outside the repository");
  if (pattern.includes("{") || pattern.includes("}")) refuse(pattern, "uses brace expansion, which is not supported — write one glob per exclusion");
  if (pattern.startsWith("!")) refuse(pattern, "uses negation, which is not supported — an exclusion is already a negation, and nesting them makes the reviewed surface unreadable");
  if (/[+@!?*]\(/.test(pattern)) refuse(pattern, "uses an extglob, which is not supported");
  if (pattern.includes("***")) refuse(pattern, "uses `***`, which is not a construct");

  // `vendor/` is the shorthand a reviewer will reach for, and it must mean the tree rather than a
  // file with an odd name.
  const normalised = pattern.endsWith(SEP) ? `${pattern}**` : pattern;

  let re = "";
  const segments = normalised.split(SEP);
  segments.forEach((segment, i) => {
    const last = i === segments.length - 1;
    if (segment === "**") {
      // Consume this separator too, so `a/**` matches `a/b` and `**/x` matches `x`.
      re += last ? "(?:.*)" : "(?:.*" + SEP + ")?";
      return;
    }
    if (segment.includes("**")) {
      refuse(pattern, "uses `**` inside a path segment, where it would silently mean `*` — put it in a segment of its own");
    }
    re += segmentToRegExp(pattern, segment);
    if (!last) re += SEP;
  });

  const compiled = new RegExp(`^${re}$`);
  return {
    pattern,
    test(candidate) {
      return compiled.test(candidate);
    },
  };
}

function segmentToRegExp(pattern, segment) {
  let out = "";
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (c === "*") {
      out += `[^${SEP}]*`;
    } else if (c === "?") {
      out += `[^${SEP}]`;
    } else if (c === "[") {
      const close = segment.indexOf("]", i + 1);
      if (close < 0) refuse(pattern, "has an unclosed character class");
      let body = segment.slice(i + 1, close);
      if (body.length === 0) refuse(pattern, "has an empty character class");
      let negate = "";
      if (body[0] === "!" || body[0] === "^") {
        negate = "^";
        body = body.slice(1);
        if (body.length === 0) refuse(pattern, "has a negated character class with nothing in it");
      }
      // Escape everything structural; `-` is preserved so ranges keep working.
      const safe = body.replace(/[\\\]^]/g, (m) => `\\${m}`);
      out += `[${negate}${safe}]`;
      i = close;
    } else if (c === "]") {
      refuse(pattern, "has a `]` with no opening `[`");
    } else {
      out += c.replace(/[.*+?^${}()|[\]\\]/g, (m) => `\\${m}`);
    }
  }
  return out;
}

/**
 * Compile a list of exclusion globs.
 *
 * Each entry is `{ path, reason }` — ADR 0007 requires an exclusion to be *reasoned*, so a missing
 * reason is refused here rather than accepted and reported later. Returns compiled matchers in the
 * order given; duplicates are refused because two identical exclusions with different reasons make
 * the report ambiguous about which one is doing the work.
 */
export function compileExclusions(exclusions) {
  if (!Array.isArray(exclusions)) refuse(String(exclusions), "list is not an array");
  const seen = new Set();
  return exclusions.map((e) => {
    if (!e || typeof e !== "object") refuse(String(e), "entry is not an object with `path` and `reason`");
    if (typeof e.reason !== "string" || e.reason.trim().length === 0) {
      refuse(String(e.path), "has no reason. An exclusion with no reason is indistinguishable from an oversight");
    }
    if (seen.has(e.path)) refuse(e.path, "appears twice, so a report cannot say which reason narrowed the surface");
    seen.add(e.path);
    return { ...compileGlob(e.path), reason: e.reason };
  });
}

/** The first exclusion covering this path, or `null`. Order is the recorded order, so it is stable. */
export function excludedBy(compiled, candidate) {
  for (const g of compiled) if (g.test(candidate)) return g;
  return null;
}
