// Specimen for ST-16, adversarial round four. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

function inner(xs) { for (const x of xs) assert.ok(ok(x)); }
function outer(ys) { inner(ys); }
outer(files);
