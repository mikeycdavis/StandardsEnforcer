// Specimen for ST-16. Held OUTSIDE the enumerated test surface so it stays re-runnable
// without reddening the suite for ever. Never imported at runtime; read as text.

while (queue.length) {
  const f = queue.pop();
  assert.ok(!f.includes("X"), "bad");
}
