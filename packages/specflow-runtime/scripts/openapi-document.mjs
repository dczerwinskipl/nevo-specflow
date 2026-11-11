// `pnpm api:openapi [--check]`: runs the built command (the root script builds the package first).
import { Validator } from '@seriousme/openapi-schema-validator';

import { runOpenApiDocumentCommand } from '../dist/openapi-document.js';

/** OpenAPI 3.1 schema validation; the validator also fails on a `$ref` it cannot resolve. */
async function validateOpenApi(document) {
  const validator = new Validator();
  // The validator resolves references in the object it is given; the command keeps its own copy.
  const result = await validator.validate(structuredClone(document));
  if (validator.version !== '3.1') {
    return [`validated as OpenAPI ${String(validator.version)}, expected 3.1`];
  }

  if (result.valid) {
    return [];
  }

  return typeof result.errors === 'string'
    ? [result.errors]
    : result.errors.map((error) => `${error.instancePath} ${error.message}`);
}

process.exitCode = await runOpenApiDocumentCommand(process.argv.slice(2), validateOpenApi);
