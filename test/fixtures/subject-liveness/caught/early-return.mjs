// Specimen for ST-16. Held OUTSIDE the enumerated test surface so it stays re-runnable
// without reddening the suite for ever. Never imported at runtime; read as text.

if (files.length === 0) return;
for (const f of files) {
  assert.ok(!f.includes("X"), "bad");
}
