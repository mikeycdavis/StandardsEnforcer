// Specimen for ST-16, adversarial round six. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const g = {};
for (const f of files) g[f.kind] = 1;
assert.deepEqual(g, {});
