// Specimen for ST-16, adversarial round six. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

let allOk = true;
files.forEach((f) => { allOk &&= check(f); });
assert.ok(allOk);
