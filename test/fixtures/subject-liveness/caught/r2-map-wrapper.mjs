// Specimen for ST-16, adversarial round two. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const m = new Map(files.map((f) => [f, 1]));
assert.equal(m.size, 0);
