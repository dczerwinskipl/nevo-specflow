/**
 * The document covers the HTTP API only: web application routes and the `/` fallback are not API,
 * and the demo seams under `/api/demo/` are not part of the specification (A-D3).
 */
export function isDocumentedRoute(url: string): boolean {
  return url.startsWith('/api/') && !url.startsWith('/api/demo/');
}

/** The OpenAPI path of a Fastify route URL: `:param` becomes `{param}`, as in the document. */
export function openApiPath(url: string): string {
  return url.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/**
 * The `operationId` of a route: the lower-case method followed by each path segment below `/api/`,
 * a path parameter as `By<Name>` (`GET /api/specs/:specId/workspace` is
 * `getSpecsBySpecIdWorkspace`). It depends only on the method and path, never on registration
 * order. The segment encoding is reversible for segments of `[a-z0-9-]`, which covers the one
 * configured segment (the OIDC provider id), so a valid configuration cannot produce two equal ids;
 * two code-defined routes with the same id are refused at registration.
 */
export function openApiOperationId(method: string, url: string): string {
  const words = url
    .replace(/^\/api\//, '')
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? `By${upperFirst(segment.slice(1))}` : segmentWords(segment),
    );

  return `${method.toLowerCase()}${words.join('')}`;
}

function upperFirst(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

const LOWER_LETTER = /^[a-z]$/;

/**
 * A path segment in PascalCase: a letter that starts the segment or follows a separator (`-`, `.`)
 * is upper-cased and that separator dropped; a separator not followed by a letter becomes `_`
 * (`sso-1` is `Sso_1`, `sso1` is `Sso1`, `a--b` is `A_B`). For `[a-z0-9-]` this is reversible:
 * an upper-case letter after the start is `-` and the letter, `_` is `-`.
 */
function segmentWords(segment: string): string {
  let words = '';
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment.charAt(index);
    if (char === '-' || char === '.') {
      words += LOWER_LETTER.test(segment.charAt(index + 1)) ? '' : '_';
      continue;
    }

    const previous = segment.charAt(index - 1);
    const startsWord = index === 0 || previous === '-' || previous === '.';
    words += startsWord && LOWER_LETTER.test(char) ? char.toUpperCase() : char;
  }

  return words;
}
