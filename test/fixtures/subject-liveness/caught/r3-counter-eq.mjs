// Specimen for ST-16, adversarial round three. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

let n = 0;
for (const f of files) if (!ok(f)) n += 1;
assert.equal(n, 0);
