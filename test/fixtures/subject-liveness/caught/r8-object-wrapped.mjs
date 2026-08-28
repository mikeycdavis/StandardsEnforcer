// Specimen for ST-16, adversarial round eight. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const report = { bad: files.filter((f) => !ok(f)) };
assert.deepEqual(report, { bad: [] });
