// Specimen for ST-16, adversarial round ten. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

assert.ok(files.map((f) => ok(f)).reduce((a, b) => a && b, true));
