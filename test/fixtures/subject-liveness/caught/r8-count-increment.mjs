// Specimen for ST-16, adversarial round eight. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

let count = 0;
files.forEach(() => { count += 1; });
assert.ok(count === files.length);
