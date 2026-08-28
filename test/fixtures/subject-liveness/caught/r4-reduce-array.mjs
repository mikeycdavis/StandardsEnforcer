// Specimen for ST-16, adversarial round four. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const chunks = files.reduce((a, f) => { if (bad(f)) a.push(f); return a; }, []);
assert.deepEqual(chunks, []);
