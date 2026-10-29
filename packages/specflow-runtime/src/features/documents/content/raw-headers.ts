import type { OpenedDocumentMetadata } from '@nevo/specflow-engine';

/**
 * Response headers of the raw document endpoint (reference "Raw content"). The goal is that a stored
 * file can never run as a page: no HTML media type is ever served, the browser may not sniff another
 * type, and a sandboxed policy without scripts applies when the URL is opened directly (this is what
 * stops script in an SVG). The Engine decides kind and media type; this module only refuses to send
 * anything outside the closed set below, whatever the Engine says.
 */

const TEXT_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'text/plain; charset=utf-8',
  'text/markdown; charset=utf-8',
]);
const IMAGE_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
]);
const BINARY_MEDIA_TYPE = 'application/octet-stream';
const FALLBACK_TEXT_MEDIA_TYPE = 'text/plain; charset=utf-8';

export const RAW_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/** The media type actually sent: the Engine's, if it belongs to the closed set for the kind. */
export function safeMediaType(
  metadata: Pick<OpenedDocumentMetadata, 'kind' | 'mediaType'>,
): string {
  switch (metadata.kind) {
    case 'text':
      return TEXT_MEDIA_TYPES.has(metadata.mediaType)
        ? metadata.mediaType
        : FALLBACK_TEXT_MEDIA_TYPE;
    case 'image':
      return IMAGE_MEDIA_TYPES.has(metadata.mediaType) ? metadata.mediaType : BINARY_MEDIA_TYPE;
    default:
      return BINARY_MEDIA_TYPE;
  }
}

/**
 * RFC 5987 `filename*` value: UTF-8, percent-encoded, with the characters `encodeURIComponent`
 * leaves alone but RFC 5987 does not allow in `attr-char` also encoded. CR, LF, quotes, semicolons
 * and every other character that could end or split a header value come out as `%XX`.
 */
export function encodeDispositionFilename(filename: string): string {
  // A lone surrogate would make encodeURIComponent throw.
  const name = filename.toWellFormed();
  const base = name.length > 0 ? name : 'download';

  return encodeURIComponent(base).replace(
    /['()*!]/gu,
    (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export interface RawHeaderInput {
  readonly metadata: Pick<
    OpenedDocumentMetadata,
    'kind' | 'mediaType' | 'filename' | 'revision' | 'size'
  >;
  /** `?download=1`. */
  readonly download: boolean;
}

/** `ETag` value for a revision. */
export function rawEtag(revision: string): string {
  return `"${revision}"`;
}

/** Every header of a successful raw response, in one place. */
export function rawResponseHeaders(input: RawHeaderInput): Record<string, string> {
  const { metadata } = input;
  const attachment = input.download || metadata.kind === 'binary';

  return {
    'Content-Type': safeMediaType(metadata),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': RAW_CONTENT_SECURITY_POLICY,
    'Content-Disposition': attachment
      ? `attachment; filename*=UTF-8''${encodeDispositionFilename(metadata.filename)}`
      : 'inline',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'private, no-cache',
    ETag: rawEtag(metadata.revision),
    'Content-Length': String(metadata.size),
  };
}

/** Headers of a 304: the validators and the protective headers, no entity headers. */
export function rawNotModifiedHeaders(revision: string): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'private, no-cache',
    ETag: rawEtag(revision),
  };
}
