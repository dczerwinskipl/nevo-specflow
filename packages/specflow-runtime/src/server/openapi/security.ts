export interface OpenApiOptions {
  /**
   * The name of the session cookie under `authentication.mode: required`; absent in trusted local
   * mode (`none`), where no operation needs a credential.
   */
  readonly sessionCookie: string | undefined;
}

/** The security scheme name of the session cookie in `components.securitySchemes`. */
export const SESSION_COOKIE_SCHEME = 'sessionCookie';

/** The document's `components` with the session cookie scheme, or none in trusted local mode. */
export function securityComponents(options: OpenApiOptions) {
  return options.sessionCookie
    ? {
        components: {
          securitySchemes: {
            [SESSION_COOKIE_SCHEME]: {
              type: 'apiKey' as const,
              in: 'cookie',
              name: options.sessionCookie,
              description:
                'The Runtime session cookie set by a successful login (password or OIDC).',
            },
          },
        },
      }
    : {};
}

/**
 * Whether an operation carries the session cookie requirement: under required authentication, every
 * route that is not `openApiPublic`.
 */
export function isSecured(
  options: OpenApiOptions,
  config: { readonly openApiPublic?: true } | undefined,
): boolean {
  return options.sessionCookie !== undefined && config?.openApiPublic !== true;
}

/** The operation `security` of a secured operation. */
export function operationSecurity(secured: boolean) {
  return secured ? { security: [{ [SESSION_COOKIE_SCHEME]: [] }] } : {};
}
