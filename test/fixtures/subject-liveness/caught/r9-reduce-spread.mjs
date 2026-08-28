// Specimen for ST-16, adversarial round nine. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const bad = files.reduce((a, f) => (worse(f) ? [...a, f] : a), []);
assert.deepEqual(bad, []);
