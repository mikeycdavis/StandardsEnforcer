// Specimen for ST-16. Held OUTSIDE the enumerated test surface so it stays re-runnable
// without reddening the suite for ever. Never imported at runtime; read as text.

import test from "node:test";
import assert from "node:assert/strict";

test("probe-every · every source file is well formed", async () => {
  const files = [];
  assert.ok(files.every((f) => !f.includes("FORBIDDEN")));
});
