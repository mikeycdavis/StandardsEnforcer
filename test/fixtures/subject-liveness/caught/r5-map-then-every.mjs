// Specimen for ST-16, adversarial round five. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const checks = files.map((f) => ok(f));
assert.ok(checks.every(Boolean));
