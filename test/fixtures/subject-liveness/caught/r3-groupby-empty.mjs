// Specimen for ST-16, adversarial round three. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const grouped = Object.groupBy(files, (f) => f.kind);
assert.deepEqual(grouped, {});
