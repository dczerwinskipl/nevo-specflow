import { randomBytes } from 'node:crypto';

import { compareIds } from '../../../compare';

/**
 * A generation file name, `<kind>-<key>.<extension>`. The key is `<epoch>-<generation>-<token>`:
 * the writer lock epoch of the writer that wrote it (see `tryAcquireWriterLock`), the generation and
 * a random token.
 */
const GENERATION_FILE = /^(manifest|vectors)-((\d+)-(\d+)-[0-9a-f]+)\.(json|f32)$/;

/** One generation's pair of files: `manifest-<key>.json` and `vectors-<key>.f32`. */
export interface GenerationFile {
  readonly epoch: number;
  readonly generation: number;
  readonly key: string;
}

/** A generation file's kind and key, or `undefined` for any other name. */
export function parseGenerationFile(
  name: string,
): (GenerationFile & { readonly kind: 'manifest' | 'vectors' }) | undefined {
  const match = GENERATION_FILE.exec(name);
  if (!match || (match[1] === 'manifest') !== (match[5] === 'json')) {
    return undefined;
  }

  return {
    kind: match[1] as 'manifest' | 'vectors',
    key: match[2]!,
    epoch: Number(match[3]),
    generation: Number(match[4]),
  };
}

/**
 * The publication order: a higher epoch first, then a higher generation, then a higher key. A
 * former lock holder's late write, under a lower epoch, never ranks above the current owner's.
 */
export function compareGenerations(a: GenerationFile, b: GenerationFile): number {
  return a.epoch - b.epoch || a.generation - b.generation || compareIds(a.key, b.key);
}

/** Manifest files of a listing in publication order, highest first. */
export function generationFiles(names: readonly string[]): GenerationFile[] {
  const files: GenerationFile[] = [];
  for (const name of names) {
    const file = parseGenerationFile(name);
    if (file?.kind === 'manifest') {
      files.push({ epoch: file.epoch, generation: file.generation, key: file.key });
    }
  }

  return files.sort((a, b) => compareGenerations(b, a));
}

/** The key of a new generation pair. */
export function generationKey(epoch: number, generation: number): string {
  return `${String(epoch)}-${String(generation)}-${newToken()}`;
}

export function newToken(): string {
  return randomBytes(8).toString('hex');
}
