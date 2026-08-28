// Specimen for ST-16, adversarial round two. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const allOk = (xs) => xs.every((x) => ok(x));
assert.ok(allOk(files));
