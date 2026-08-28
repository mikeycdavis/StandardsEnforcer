// Specimen for ST-16, adversarial round nine. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

let allOk = files.length === 0;
for (const f of files) allOk ||= check(f);
assert.ok(allOk);
