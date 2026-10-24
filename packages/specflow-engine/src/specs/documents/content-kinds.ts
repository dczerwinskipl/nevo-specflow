import type { ContentKind } from '@nevo/specflow-contracts/documents';

import { CONTENT_SNIFF_BYTES } from './limits';

/**
 * Content kinds (architecture "Content kinds"): closed extension table decided by the Engine. A text
 * extension whose first {@link CONTENT_SNIFF_BYTES} bytes contain NUL or are not valid UTF-8 is
 * `binary`.
 */

export const TEXT_EXTENSIONS = [
  'md',
  'markdown',
  'txt',
  'json',
  'csv',
  'tsv',
  'yaml',
  'yml',
  'toml',
  'xml',
  'html',
  'css',
  'js',
  'mjs',
  'ts',
  'tsx',
  'jsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'sh',
  'sql',
] as const;

/** Extension to media type served by the raw endpoint, images only. */
export const IMAGE_MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

export const BINARY_MEDIA_TYPE = 'application/octet-stream';
export const TEXT_MEDIA_TYPE = 'text/plain; charset=utf-8';
export const MARKDOWN_MEDIA_TYPE = 'text/markdown; charset=utf-8';

/** Extensions the first release lets a person edit. */
export const EDITABLE_EXTENSIONS = ['md', 'txt'] as const;

export interface ContentClassification {
  readonly kind: ContentKind;
  readonly mediaType: string;
}

const textExtensions: ReadonlySet<string> = new Set(TEXT_EXTENSIONS);
const imageExtensions: ReadonlySet<string> = new Set(Object.keys(IMAGE_MEDIA_TYPES));

/** Lowercase extension without the dot of the last path segment; empty when there is none. */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index + 1).toLowerCase();
}

/** Kind by extension alone, before the content check. */
export function kindForExtension(extension: string): ContentKind {
  const key = normaliseExtension(extension);
  if (imageExtensions.has(key)) return 'image';
  return textExtensions.has(key) ? 'text' : 'binary';
}

/** True when `bytes` (the first {@link CONTENT_SNIFF_BYTES} of a file) are valid UTF-8 without NUL. */
export function looksLikeText(bytes: Uint8Array): boolean {
  const head = bytes.length > CONTENT_SNIFF_BYTES ? bytes.subarray(0, CONTENT_SNIFF_BYTES) : bytes;
  if (head.includes(0)) return false;
  try {
    // A multi-byte sequence cut by the sniff window is not an error; at end of file it is.
    new TextDecoder('utf-8', { fatal: true }).decode(head, {
      stream: head.length >= CONTENT_SNIFF_BYTES,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Kind and media type of a file from its extension and its first bytes. Images are decided by the
 * extension alone (never inspected, never inline-rendered markup).
 */
export function classifyContent(extension: string, firstBytes: Uint8Array): ContentClassification {
  const key = normaliseExtension(extension);
  const imageMediaType = IMAGE_MEDIA_TYPES[key];
  if (imageMediaType !== undefined) return { kind: 'image', mediaType: imageMediaType };
  if (textExtensions.has(key) && looksLikeText(firstBytes)) {
    return {
      kind: 'text',
      mediaType: key === 'md' || key === 'markdown' ? MARKDOWN_MEDIA_TYPE : TEXT_MEDIA_TYPE,
    };
  }
  return { kind: 'binary', mediaType: BINARY_MEDIA_TYPE };
}

/** Editable extension in the first release (`md`, `txt`); size, kind and location are checked elsewhere. */
export function isEditableExtension(extension: string): boolean {
  return (EDITABLE_EXTENSIONS as readonly string[]).includes(normaliseExtension(extension));
}

function normaliseExtension(extension: string): string {
  return (extension.startsWith('.') ? extension.slice(1) : extension).toLowerCase();
}
