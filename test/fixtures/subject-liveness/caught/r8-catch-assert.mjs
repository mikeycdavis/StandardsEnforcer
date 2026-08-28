// Specimen for ST-16, adversarial round eight. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

try {
  for (const f of files) validate(f);
} catch (e) {
  assert.fail(e.message);
}
