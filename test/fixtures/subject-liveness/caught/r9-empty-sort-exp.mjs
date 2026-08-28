// Specimen for ST-16, adversarial round nine. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

assert.deepEqual(files.filter((f) => bad(f)).map((f) => f.id).sort(), [].sort());
