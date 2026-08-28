// Specimen for ST-16, adversarial round three. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const extra = new Set(files.map((f) => f.id));
for (const id of KNOWN) extra.delete(id);
assert.equal(extra.size, 0);
