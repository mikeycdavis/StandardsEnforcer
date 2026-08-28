// Specimen for ST-16, adversarial round nine. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const outcomes = await Promise.all(files.map((f) => probe(f)));
assert.ok(outcomes.every(Boolean));
