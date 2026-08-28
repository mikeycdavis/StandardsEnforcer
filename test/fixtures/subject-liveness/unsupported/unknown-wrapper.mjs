// FALSIFIER 2, ST-16 round three. An assertion wrapper the mechanism has never heard of.
//
// `assertingHelpers` follows a wrapper DEFINED in the file, and `verdictReachingImports` follows one
// imported from a repository module. This one comes from a package, so neither can read its body and
// the loop below reads as data shaping over a subject nobody proved had elements.
//
// The rejection is `foreign-module`, and it is structural rather than name-based: the specifier is
// neither `node:` nor relative, so nothing in the repository can resolve it. Renaming the package
// does not change the answer.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { mustBeValid } from "@acme/test-helpers";

const files = readdirSync("cases");
assert.equal(typeof files, "object", "an honest assertion, so the dialect guard is satisfied");

for (const f of files) mustBeValid(f);
