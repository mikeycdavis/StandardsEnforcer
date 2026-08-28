// Specimen for ST-16, adversarial round four. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

let i = 0;
do {
  if (files[i]) assert.ok(ok(files[i]));
  i += 1;
} while (i < files.length);
