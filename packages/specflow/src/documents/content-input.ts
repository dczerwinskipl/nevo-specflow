import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DocumentError } from '@nevo/specflow-engine';

/** Largest body the CLI reads before the Engine applies its own (smaller) content limit. */
export const CONTENT_INPUT_MAX_BYTES = 8 * 1024 * 1024;

export interface ContentSource {
  readonly contentFile?: string;
  readonly stdin?: boolean;
}

export interface ContentInputContext {
  readonly cwd: string;
  readonly readStdin?: () => Promise<string>;
}

export function tooLarge(): DocumentError {
  return new DocumentError('DOCUMENT_TOO_LARGE', 'The content is larger than the CLI reads.');
}

/** The text of bytes that must be UTF-8: anything else is refused, never replaced by U+FFFD. */
export function decodeUtf8Content(bytes: Uint8Array, name: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new DocumentError('DOCUMENT_OPERATION_INVALID', `${name} is not valid UTF-8 text.`);
  }
}

/**
 * Reads a byte stream (standard input) to the end as UTF-8 text. The bound is enforced while the bytes
 * arrive, so a stream larger than {@link CONTENT_INPUT_MAX_BYTES} is refused without buffering it.
 */
export async function readBoundedUtf8(
  stream: AsyncIterable<Uint8Array | string>,
  name: string,
): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
    size += bytes.length;
    if (size > CONTENT_INPUT_MAX_BYTES) {
      throw tooLarge();
    }

    chunks.push(bytes);
  }

  return decodeUtf8Content(Buffer.concat(chunks), name);
}

/** The text of `--content-file` (relative to the working directory) or of standard input. */
export async function readContentInput(
  source: ContentSource,
  context: ContentInputContext,
): Promise<string> {
  if (source.stdin) {
    if (!context.readStdin) {
      throw new Error('Standard input is not available.');
    }

    const text = await context.readStdin();
    if (Buffer.byteLength(text, 'utf8') > CONTENT_INPUT_MAX_BYTES) {
      throw tooLarge();
    }

    return text;
  }

  if (source.contentFile === undefined) {
    throw new Error('No content was given.');
  }

  const path = resolve(context.cwd, source.contentFile);
  const info = await stat(path);
  if (!info.isFile()) {
    throw new Error(`Not a regular file: ${source.contentFile}`);
  }

  if (info.size > CONTENT_INPUT_MAX_BYTES) {
    throw tooLarge();
  }

  return decodeUtf8Content(await readFile(path), `The file ${source.contentFile}`);
}
