// Specimen for ST-16. Held OUTSIDE the enumerated test surface so it stays re-runnable
// without reddening the suite for ever. Never imported at runtime; read as text.

const n = files.filter((f) => f.includes("X")).length;
assert.equal(n, 0);
