// Specimen for ST-16, adversarial round two. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const bad = new Set(files.filter((f) => wrong(f)));
assert.equal(bad.size, 0);
