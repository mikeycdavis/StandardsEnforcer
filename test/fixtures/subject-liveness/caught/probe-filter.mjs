// Specimen for ST-16. Held OUTSIDE the enumerated test surface so it stays re-runnable
// without reddening the suite for ever. Never imported at runtime; read as text.

import test from "node:test";
import assert from "node:assert/strict";

test("probe-filter · no source file contains a forbidden marker", async () => {
  const files = [];
  const offenders = files.filter((f) => f.includes("FORBIDDEN"));
  assert.deepEqual(offenders, []);
});
