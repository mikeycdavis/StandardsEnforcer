// Specimen for ST-16, adversarial round seven. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

for (const [k, v] of new Map(files.map((f) => [f.k, f]))) assert.ok(v, k);
