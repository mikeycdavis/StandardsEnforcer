// Specimen for ST-16, adversarial round four. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const bad = files.find((f) => !ok(f));
assert.equal(bad, undefined);
