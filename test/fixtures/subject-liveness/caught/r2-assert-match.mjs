// Specimen for ST-16, adversarial round two. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

assert.match(files.filter((f) => bad(f)).join(","), /^$/u);
