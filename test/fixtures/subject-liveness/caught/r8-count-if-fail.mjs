// Specimen for ST-16, adversarial round eight. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const n = files.filter((f) => !ok(f)).length;
if (n) assert.fail("bad files");
