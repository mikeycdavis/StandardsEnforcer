// Specimen for ST-16, adversarial round nine. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const set = new Set();
for (const f of files) set.add(f.kind);
assert.ok(set.size === 0);
