#!/usr/bin/env node
// Regenerates schema/archetype-definitions.schema.json from the TypeBox definition types.
// Run `pnpm --filter @nevo/specflow-contracts build` first: the script reads dist/.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { serializeArchetypeDefinitionsJsonSchema } from '../dist/documents/index.js';

const target = fileURLToPath(
  new URL('../schema/archetype-definitions.schema.json', import.meta.url),
);
writeFileSync(target, serializeArchetypeDefinitionsJsonSchema());
console.log(`wrote ${target}`);
