/**
 * Machine-learning footprint detection: evidence, and never a decision.
 *
 * This module answers exactly one question — *what ML-like evidence did automation observe in this
 * tree?* — and it is structurally incapable of answering the question that matters, which is whether
 * MachineLearningStandards governs the repository. That separation is the whole design. A detector
 * that could set a disposition would become an oracle, and the four adoptions behind
 * MachineLearningStandards 1.0–1.4 spent their entire budget establishing that this class of
 * detector is not one.
 *
 * Two rules follow from that and are load-bearing:
 *
 *   FINDING SOMETHING can contradict a recorded human decision.
 *   FINDING NOTHING can never confirm one.
 *
 * The second is the negative-evidence lesson from MachineLearningStandards 1.2, applied one level
 * out. Silence here is not evidence of absence; it is absence of evidence, and `assurance` says so
 * in the payload rather than in a comment nobody reads.
 *
 * Detection also inherits the use/mention discipline. A README saying "we use PyTorch" is a mention.
 * An import of `torch` in a code file is a use. Prose is never scanned for imports.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const SKIP_DIRS = new Set([
  ".git", "node_modules", "__pycache__", ".venv", "venv", "env", ".tox", ".mypy_cache",
  ".pytest_cache", "site-packages", "dist", "build", ".next", ".gradle", "vendor",
]);

/** Frameworks whose presence in code is training-shaped work rather than numerical work. */
const TRAINING_FRAMEWORKS = [
  "sklearn", "scikit_learn", "torch", "tensorflow", "keras", "xgboost", "lightgbm", "catboost",
  "statsmodels", "transformers", "ultralytics", "jax", "flax", "pytorch_lightning", "lightning",
  "fastai", "mxnet", "paddle", "timm", "detectron2", "gluonts", "prophet",
];

/**
 * Clients for someone else's model. Deliberately a separate signal kind: a repository that calls an
 * inference API trains and evaluates nothing, and collapsing it into the training signals would
 * manufacture exactly the false positive a human reviewer is there to catch.
 */
const INFERENCE_CLIENTS = ["openai", "anthropic", "cohere", "replicate", "together", "groq"];

const TRACKING = ["mlflow", "wandb", "hydra", "optuna", "sacred", "clearml", "neptune", "tensorboard", "aim"];

/**
 * Deliberately absent: numpy, pandas, scipy, matplotlib.
 *
 * Generic numerical code is the classic false positive, and a repository doing statistics is not a
 * repository doing machine learning. Leaving them out costs recall the human reviewer can restore
 * and buys precision automation cannot.
 */

const CALL_SHAPES = [/\.fit\s*\(/, /\.fit_transform\s*\(/, /train_test_split\s*\(/, /\bTrainer\s*\(/, /\.backward\s*\(\s*\)/, /\.train\s*\(\s*\)/];

const MODEL_EXT = new Set([".pt", ".pth", ".pkl", ".joblib", ".h5", ".onnx", ".safetensors", ".ckpt", ".pb"]);
const DATA_EXT = new Set([".csv", ".parquet", ".tfrecord", ".feather", ".arrow", ".npz"]);
const MANIFESTS = new Set(["requirements.txt", "requirements-dev.txt", "pyproject.toml", "environment.yml", "environment.yaml", "Pipfile", "setup.py", "setup.cfg"]);
const CODE_EXT = new Set([".py", ".ipynb"]);

/** Every signal kind this detector can emit. The digest is computed over a subset of these. */
export const SIGNAL_KINDS = {
  "training-framework-import": "a training framework is imported by code in this repository",
  "training-framework-dependency": "a training framework is declared in a dependency manifest",
  "training-call-shape": "code calls a training-shaped API alongside a training framework import",
  "inference-client": "code calls a hosted model API but trains nothing",
  "experiment-tracking": "experiment tracking or sweep tooling is imported",
  "model-artifact": "a serialised model is committed",
  "dataset-artifact": "tabular or tensor data is committed",
};

/**
 * Strip comments and blank string contents so that naming a library is never mistaken for using it.
 *
 * Approximate by design, and approximate in the safe direction: a missed strip can only turn a
 * mention into a false signal, which surfaces a repository for human review. The opposite error —
 * silently discarding real code — would let detection go quiet, and quiet is the failure mode this
 * whole module is arranged to prevent.
 */
export function codeView(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "#") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const triple = text.startsWith(c.repeat(3), i);
      const close = triple ? c.repeat(3) : c;
      i += close.length;
      while (i < text.length && !text.startsWith(close, i)) {
        if (text[i] === "\\") i++;
        if (text[i] === "\n" && !triple) break;
        i++;
      }
      i += close.length;
      out += '""';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Notebook code cells, concatenated. Markdown cells are prose and are not scanned. */
function notebookCode(text) {
  try {
    const nb = JSON.parse(text);
    return (nb.cells ?? [])
      .filter((c) => c.cell_type === "code")
      .map((c) => (Array.isArray(c.source) ? c.source.join("") : c.source ?? ""))
      .join("\n");
  } catch {
    return "";
  }
}

function importsAny(view, names) {
  for (const n of names) {
    const re = new RegExp(`(^|\\n)\\s*(from\\s+${n}[\\w.]*\\s+import|import\\s+${n}(\\s|,|\\.|$))`, "m");
    if (re.test(view)) return n;
  }
  return null;
}

function walk(root, out = [], rel = "") {
  let entries;
  try {
    entries = readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(root, out, r);
    } else if (e.isFile()) {
      out.push(r);
    }
    if (out.length > 20000) return out;
  }
  return out;
}

/**
 * Observe the ML footprint of a tree.
 *
 * Returns `{ kinds, signals, digest, assurance, note, filesScanned }`. `kinds` is the sorted set of
 * signal kinds and is what the digest covers — deliberately not file contents, so that ordinary
 * commits to a repository whose ML character has not changed do not manufacture review churn, while
 * a repository that acquires or loses a whole kind of ML evidence does.
 */
export function detectFootprint(root) {
  const signals = [];
  const add = (kind, why, evidence) => signals.push({ kind, why, evidence, label: "INFERRED" });

  const files = walk(root);
  const seen = new Set();

  for (const rel of files) {
    const base = path.basename(rel);
    const ext = path.extname(rel).toLowerCase();

    if (MODEL_EXT.has(ext) && !seen.has("model-artifact")) {
      seen.add("model-artifact");
      add("model-artifact", `${rel} is a serialised model`, [rel]);
    }
    if ((DATA_EXT.has(ext) || ext === ".dvc") && !seen.has("dataset-artifact")) {
      seen.add("dataset-artifact");
      add("dataset-artifact", `${rel} is committed data`, [rel]);
    }

    if (MANIFESTS.has(base) && !seen.has("training-framework-dependency")) {
      let text = "";
      try { text = readFileSync(path.join(root, rel), "utf8"); } catch { continue; }
      const hit = TRAINING_FRAMEWORKS.find((f) =>
        new RegExp(`(^|[\\s"'\\[])(${f.replace(/_/g, "[-_]")})([\\s"'\\]=<>~!,;)]|$)`, "mi").test(text));
      if (hit) {
        seen.add("training-framework-dependency");
        add("training-framework-dependency", `${rel} declares ${hit}`, [rel]);
      }
      continue;
    }

    if (!CODE_EXT.has(ext)) continue;
    let raw = "";
    try {
      const st = statSync(path.join(root, rel));
      if (st.size > 4 * 1024 * 1024) continue;
      raw = readFileSync(path.join(root, rel), "utf8");
    } catch { continue; }

    const view = codeView(ext === ".ipynb" ? notebookCode(raw) : raw);

    const fw = importsAny(view, TRAINING_FRAMEWORKS);
    if (fw && !seen.has("training-framework-import")) {
      seen.add("training-framework-import");
      add("training-framework-import", `${rel} imports ${fw}`, [rel]);
    }
    // Corroborating only, and only in a file that already imports a framework. A bare `.fit(` in
    // scipy code is not training, and a signal that fires on it teaches reviewers to ignore signals.
    if (fw && !seen.has("training-call-shape") && CALL_SHAPES.some((re) => re.test(view))) {
      seen.add("training-call-shape");
      add("training-call-shape", `${rel} calls a training-shaped API`, [rel]);
    }
    const ic = importsAny(view, INFERENCE_CLIENTS);
    if (ic && !seen.has("inference-client")) {
      seen.add("inference-client");
      add("inference-client", `${rel} imports ${ic}, a client for a hosted model`, [rel]);
    }
    const tr = importsAny(view, TRACKING);
    if (tr && !seen.has("experiment-tracking")) {
      seen.add("experiment-tracking");
      add("experiment-tracking", `${rel} imports ${tr}`, [rel]);
    }
  }

  const kinds = [...seen].sort();
  return {
    kinds,
    signals,
    digest: footprintDigest(kinds),
    filesScanned: files.length,
    // Stated in the payload, not just here, because a consumer that treats this as complete would
    // be making precisely the inference the module is built to refuse.
    assurance: "partial",
    note:
      "Detection is partial and one-directional. Evidence found can contradict a recorded scope " +
      "decision; evidence not found establishes nothing about whether this repository does " +
      "machine-learning work. Unrecognised frameworks, vendored code and generated pipelines are " +
      "invisible to it.",
  };
}

/** Stable over ordering and over churn that does not change what kind of ML evidence exists. */
export function footprintDigest(kinds) {
  return createHash("sha256").update([...kinds].sort().join("\n")).digest("hex").slice(0, 32);
}

// A reviewer needs the evidence basis to paste into a registry entry, and asking them to hand-write
// a digest is asking for a decision that can never go stale. Exit is always 0: this reports, and
// reporting is not a verdict.
if (process.argv[1]?.endsWith("footprint.mjs")) {
  const root = path.resolve(process.argv[2] ?? ".");
  const f = detectFootprint(root);
  process.stdout.write(JSON.stringify({ root, reviewedFootprint: { kinds: f.kinds, digest: f.digest }, signals: f.signals, assurance: f.assurance, note: f.note }, null, 2) + "\n");
}
