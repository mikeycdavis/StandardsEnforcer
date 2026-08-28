// Specimen for ST-16, adversarial round six. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const out = [];
files.forEach((f) => { if (bad(f)) out.push(f); });
assert.deepEqual(out, []);
