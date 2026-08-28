// Specimen for ST-16, adversarial round five. Held OUTSIDE the enumerated test surface so it
// stays re-runnable without reddening the suite for ever. Never imported at runtime; read as text.

let msgs = "";
for (const f of files) if (!ok(f)) msgs += f.name;
assert.equal(msgs, "");
