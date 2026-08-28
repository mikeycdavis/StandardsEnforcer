// Specimen for ST-16, adversarial round six. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const res = await Promise.all(files.map((f) => check(f)));
assert.deepEqual(res.filter(Boolean), []);
