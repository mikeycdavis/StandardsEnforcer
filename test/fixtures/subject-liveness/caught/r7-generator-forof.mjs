// Specimen for ST-16, adversarial round seven. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

for (const f of walkAll(files)) assert.ok(ok(f));
