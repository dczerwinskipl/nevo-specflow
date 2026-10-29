#!/usr/bin/env node
// Regenerates the committed JSON Schemas from the TypeBox definition types:
//   schema/archetype-definitions.schema.json            (aggregate file, retired together with its callers)
//   schema/definitions/<kind>.v<schemaVersion>.schema.json (one per definition kind)
// Run `pnpm --filter @nevo/specflow-contracts build` first: the script reads dist/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  DEFINITION_KINDS,
  definitionJsonSchemaFileName,
  serializeArchetypeDefinitionsJsonSchema,
  serializeDefinitionJsonSchema,
} from '../dist/documents/index.js';

const aggregate = fileURLToPath(
  new URL('../schema/archetype-definitions.schema.json', import.meta.url),
);
writeFileSync(aggregate, serializeArchetypeDefinitionsJsonSchema());
console.log(`wrote ${aggregate}`);

const directory = new URL('../schema/definitions/', import.meta.url);
mkdirSync(directory, { recursive: true });
for (const kind of DEFINITION_KINDS) {
  const target = fileURLToPath(new URL(definitionJsonSchemaFileName(kind), directory));
  writeFileSync(target, serializeDefinitionJsonSchema(kind));
  console.log(`wrote ${target}`);
}
