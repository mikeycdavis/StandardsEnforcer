// Specimen for ST-16, adversarial round seven. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

let last;
for (const f of files) if (!ok(f)) last = f;
assert.equal(last, undefined);
