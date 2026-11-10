import { referenceIdentifiersInComponents } from '../shared-contracts';

const COMPONENT_NAME = /^[A-Za-z0-9._-]+$/;

/** The `components.schemas` name of a shared schema: its `$id`, which MUST be a component name. */
export function componentName(json: { readonly $id?: unknown }): string {
  if (typeof json.$id !== 'string' || !COMPONENT_NAME.test(json.$id)) {
    throw new Error(`A shared schema $id must be an OpenAPI component name: ${String(json.$id)}`);
  }

  return json.$id;
}

/**
 * The finished document in which shared contracts reference the identifiers they contain, as route
 * schemas do (documentation only: the registered contracts keep their inline identifiers for
 * validation).
 */
export function withIdentifierReferences<
  Document extends { readonly components?: { readonly schemas?: Record<string, unknown> } },
>(document: Document): Document {
  const schemas = document.components?.schemas;

  return schemas
    ? {
        ...document,
        components: { ...document.components, schemas: referenceIdentifiersInComponents(schemas) },
      }
    : document;
}
