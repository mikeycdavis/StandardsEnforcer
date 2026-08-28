// Specimen for ST-16, adversarial round two. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const n = files.reduce((a, f) => a + (bad(f) ? 1 : 0), 0);
assert.equal(n, 0);
