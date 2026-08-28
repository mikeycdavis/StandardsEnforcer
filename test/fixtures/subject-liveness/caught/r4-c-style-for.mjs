// Specimen for ST-16, adversarial round four. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

for (let i = 0; i < files.length; i += 1) {
  assert.ok(ok(files[i]));
}
