// Specimen for ST-16, adversarial round nine. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

const failures = [];
for (const f of files) {
  if (ok(f)) continue;
  failures.push(f);
}
assert.deepEqual(failures, []);
