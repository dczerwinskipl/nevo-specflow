import type { FastifyReply } from 'fastify';

/** Weak comparison of `If-None-Match` (a list of entity tags, or `*`) with the current entity tag. */
export function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(',')
    .map((item) => item.trim().replace(/^W\//u, ''))
    .some((item) => item === '*' || item === etag);
}

/**
 * A `304` with no body and no entity headers. Sending the placeholder `null` serialises it to a
 * 4 byte JSON body that Node then drops while its `Content-Type` and `Content-Length` would stay on the
 * wire and describe a body that is not there; this removes them. Validators set before (`ETag`,
 * `Cache-Control`) are kept.
 */
export function sendNotModified(reply: FastifyReply): FastifyReply {
  return reply.code(304).removeHeader('content-type').removeHeader('content-length').send();
}
