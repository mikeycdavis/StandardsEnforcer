// Specimen for ST-16. Held OUTSIDE the enumerated test surface so it stays re-runnable
// without reddening the suite for ever. Never imported at runtime; read as text.

assert.equal(files.length === 0 ? 0 : files.filter((f) => f.includes("X")).length, 0);
