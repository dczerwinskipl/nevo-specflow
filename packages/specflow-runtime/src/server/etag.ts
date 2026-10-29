/** The part of a Fastify reply a bodyless answer needs, whatever the route schema declares. */
interface BodylessReply {
  code(statusCode: number): BodylessReply;
  removeHeader(name: string): BodylessReply;
  send(): unknown;
}

/**
 * Weak comparison of `If-None-Match` (a list of entity tags, possibly repeated header lines, or `*`)
 * with the current entity tag, which may itself be weak.
 */
export function matchesEtag(header: string | string[] | undefined, etag: string): boolean {
  const value = Array.isArray(header) ? header.join(',') : header;
  if (!value) {
    return false;
  }

  const weak = (tag: string): string => tag.trim().replace(/^W\//u, '');
  const current = weak(etag);

  return value.split(',').some((item) => weak(item) === '*' || weak(item) === current);
}

/**
 * A `304` with no body and no entity headers. Sending the placeholder `null` serialises it to a
 * 4 byte JSON body that Node then drops while its `Content-Type` and `Content-Length` would stay on the
 * wire and describe a body that is not there; this removes them. Validators set before (`ETag`,
 * `Cache-Control`) are kept.
 */
export function sendNotModified<R>(reply: R): R {
  // Typed replies only know the declared status codes and payloads; a 304 has neither.
  (reply as unknown as BodylessReply)
    .code(304)
    .removeHeader('content-type')
    .removeHeader('content-length')
    .send();

  return reply;
}
