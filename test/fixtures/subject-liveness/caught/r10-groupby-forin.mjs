// Specimen for ST-16, adversarial round ten. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const g = Object.groupBy(files, (f) => f.kind);
for (const k in g) assert.ok(g[k]);
