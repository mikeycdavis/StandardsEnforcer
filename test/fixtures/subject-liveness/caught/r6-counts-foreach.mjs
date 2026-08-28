// Specimen for ST-16, adversarial round six. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const counts = {};
files.forEach((f) => { counts[f.k] = (counts[f.k] ?? 0) + 1; });
assert.deepEqual(counts, {});
