// Specimen for ST-16, adversarial round three. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const verify = (xs) => { for (const x of xs) assert.ok(ok(x)); };
verify(files);
