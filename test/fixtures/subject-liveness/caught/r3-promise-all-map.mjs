// Specimen for ST-16, adversarial round three. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

await Promise.all(files.map(async (f) => {
  assert.ok(await ok(f));
}));
