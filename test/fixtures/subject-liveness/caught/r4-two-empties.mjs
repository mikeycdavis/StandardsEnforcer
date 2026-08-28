// Specimen for ST-16, adversarial round four. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

assert.equal(files.filter((f) => bad(f)).length, files.filter((f) => worse(f)).length);
