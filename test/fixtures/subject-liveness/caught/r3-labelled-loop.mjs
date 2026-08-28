// Specimen for ST-16, adversarial round three. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

outer: for (const f of files) {
  for (const r of f.rules) assert.ok(r.ok);
  continue outer;
}
