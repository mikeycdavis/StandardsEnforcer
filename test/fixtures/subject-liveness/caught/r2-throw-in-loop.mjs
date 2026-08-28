// Specimen for ST-16, adversarial round two. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

for (const f of files) {
  if (!ok(f)) throw new Error("bad file");
}
