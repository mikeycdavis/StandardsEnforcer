// Specimen for ST-16. Held OUTSIDE the enumerated test surface so it stays re-runnable
// without reddening the suite for ever. Never imported at runtime; read as text.

for (const k in table) {
  assert.ok(!k.includes("X"), "bad key");
}
