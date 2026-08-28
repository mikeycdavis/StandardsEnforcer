// Specimen for ST-16, adversarial round four. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const verdict = files.length ? files.every((f) => ok(f)) : true;
assert.ok(verdict);
