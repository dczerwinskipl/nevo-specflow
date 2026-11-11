import type { TSchema } from 'typebox';

/**
 * Documentation of a response that Runtime does not serialize from a response schema: a reply
 * without a body (`204`, a redirect), an event stream written to the raw socket, or a JSON refusal
 * whose serialization a response schema would change. The route declares this documentation in its
 * `config` instead and only the OpenAPI document reads it.
 */
export type OpenApiDocumentedResponse = {
  readonly description: string;
  /** Response headers worth documenting: header name to description. */
  readonly headers?: Readonly<Record<string, string>>;
} & (
  | {
      /** The media type of the body; absent for a response without a body. */
      readonly mediaType?: 'text/event-stream';
      readonly contract?: never;
    }
  | {
      /**
       * A JSON body: a registered shared contract, documented as its component, or several of them
       * (`anyOf` of their components) when the status answers more than one body.
       */
      readonly contract: TSchema | readonly [TSchema, TSchema, ...TSchema[]];
      readonly mediaType?: never;
    }
);

/** Where a documentation-only parameter is read. */
export type OpenApiParameterLocation = 'header' | 'query';

/** Documentation-only parameters of a route: by location, name to description. */
export type OpenApiDocumentedParameters = Readonly<
  Partial<Record<OpenApiParameterLocation, Readonly<Record<string, string>>>>
>;

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Documentation-only responses by status code. A status code MUST NOT also have a response
     * schema: a JSON body is documented by its schema.
     */
    readonly openApiResponses?: Readonly<Record<number, OpenApiDocumentedResponse>>;
    /**
     * The route answers without an authenticated principal: it does not use request authorization
     * (login, logout, the authentication state, the Runtime info). Every other documented route
     * requires access, so the document gives it the session cookie requirement under required
     * authentication.
     */
    readonly openApiPublic?: true;
    /**
     * The route's own error handling answers a request that fails its schema validation, not the
     * Runtime error handling (the Session error handling answers `SESSION_INPUT_INVALID`), so the
     * document does not add Fastify's validation `400` to it. Set by that error handling.
     */
    readonly openApiOwnValidation?: true;
    /**
     * Documentation-only request parameters: protocol parameters the handler reads itself (the
     * SSE `Last-Event-ID` header, the OIDC callback query), by location, name and description. A
     * route schema for them would change validation (a value the handler tolerates or refuses in
     * its own way would be refused before it), so only the OpenAPI document reads this. A name
     * MUST NOT also be in the route's own schema for that location.
     */
    readonly openApiParameters?: OpenApiDocumentedParameters;
  }
}
