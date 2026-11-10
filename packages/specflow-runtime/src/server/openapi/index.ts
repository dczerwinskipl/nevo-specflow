/**
 * The Runtime OpenAPI document: registration of its generation, the route that serves it and the
 * route `config` it reads (see `docs/reference/api/openapi.md`).
 */
export type { OpenApiDocumentedResponse, OpenApiParameterLocation } from './config';
export { OPENAPI_DOCUMENT_PATH, registerOpenApiRoute } from './document-route';
export { openApiOperationId } from './operations';
export {
  generateOpenApiDocument,
  openApiRouteGaps,
  registerOpenApi,
  type OpenApiRouteGap,
  type RuntimeOpenApiDocument,
} from './register';
export { SESSION_COOKIE_SCHEME, type OpenApiOptions } from './security';
export { OPENAPI_TAGS, type OpenApiTag } from './tags';
