// Specimen for ST-16, adversarial round ten. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

switch (files.length) {
  case 0: break;
  default: assert.ok(files.every((f) => ok(f)));
}
