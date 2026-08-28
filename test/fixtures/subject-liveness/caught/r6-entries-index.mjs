// Specimen for ST-16, adversarial round six. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const bad = [];
for (const [i, f] of files.entries()) if (!ok(f)) bad.push(i);
assert.equal(bad.length, 0);
