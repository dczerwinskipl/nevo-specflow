import { randomBytes } from 'node:crypto';

import { compareIds } from '../../ranking/compare';

/** A generation file name; `<key>` is `<generation>-<token>`. */
export const GENERATION_FILE = /^(manifest|vectors)-(\d+)-([0-9a-f]+)\.(json|f32)$/;

/** One generation's pair of files: `manifest-<key>.json` and `vectors-<key>.f32`. */
export interface GenerationFile {
  readonly generation: number;
  readonly key: string;
}

/** Manifest files of a listing, highest generation first (then highest key). */
export function generationFiles(names: readonly string[]): GenerationFile[] {
  return names
    .map((name) => GENERATION_FILE.exec(name))
    .filter((match) => match?.[1] === 'manifest' && match[4] === 'json')
    .map((match) => ({ generation: Number(match![2]), key: `${match![2]}-${match![3]}` }))
    .sort((a, b) => b.generation - a.generation || compareIds(b.key, a.key));
}

export function newToken(): string {
  return randomBytes(8).toString('hex');
}
