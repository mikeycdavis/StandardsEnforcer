// Specimen for ST-16, adversarial round six. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

check: for (const f of files) {
  if (!ok(f)) { assert.fail(f.name); break check; }
}
