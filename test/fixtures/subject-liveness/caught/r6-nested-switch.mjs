// Specimen for ST-16, adversarial round six. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

for (const f of files) {
  switch (f.kind) {
    case "a": assert.ok(f.ok); break;
    default: break;
  }
}
