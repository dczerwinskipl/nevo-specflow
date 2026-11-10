import { readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { compareIds } from '../../ranking/compare';
import type { VectorCandidate } from '../../ranking/vector-math';
import { validateChange, type ApplyOutcome, type VectorStoreChange } from '../vector-store';
import { removeQuietly, removeSuperseded } from './cleanup';
import { generationFiles, newToken } from './generation-files';
import { writeFailed } from './io-errors';
import { FILE_INDEX_SCHEMA_VERSION, type StoredManifest } from './manifest-file';
import { readSnapshot, type VectorsCache } from './snapshot';
import type { WriterLockDependencies } from './writer-lock';

export async function applyChange(
  directory: string,
  change: VectorStoreChange,
  cache: VectorsCache,
  lock: WriterLockDependencies,
): Promise<ApplyOutcome> {
  const current = await readSnapshot(directory, cache);
  if (current.status === 'unreadable') {
    return { status: 'write-failed', message: `The index cannot be read: ${current.message}` };
  }

  const base = current.status === 'ok' ? current.snapshot : undefined;
  if (change.baseGeneration !== base?.manifest.generation) {
    return { status: 'conflict' };
  }

  validateChange(change, base?.manifest.identity);

  const entries = new Map<string, VectorCandidate>(
    change.reset || !base ? [] : base.candidates.map((entry) => [entry.chunkId, entry]),
  );
  for (const chunkId of change.delete) {
    entries.delete(chunkId);
  }

  for (const entry of change.upsert) {
    entries.set(entry.chunkId, entry);
  }

  const ordered = [...entries.values()].sort((a, b) => compareIds(a.chunkId, b.chunkId));
  const { dimensions } = change.identity;
  const data = new Float32Array(ordered.length * dimensions);
  ordered.forEach((entry, offset) => data.set(entry.vector, offset * dimensions));

  let generation: number;
  try {
    // Above every manifest on disk, damaged ones included, so the new pair is the highest.
    const highest = generationFiles(await readdir(directory))[0]?.generation ?? 0;
    generation = Math.max(highest, base?.manifest.generation ?? 0) + 1;
  } catch (error) {
    return writeFailed('The index directory cannot be listed', error);
  }

  const key = `${generation}-${newToken()}`;
  const stored: StoredManifest = {
    schemaVersion: FILE_INDEX_SCHEMA_VERSION,
    generation,
    identity: change.identity,
    chunks: ordered.map((entry, offset) => ({
      id: entry.chunkId,
      contentHash: entry.contentHash,
      offset,
    })),
  };

  const vectorsPath = join(directory, `vectors-${key}.f32`);
  const manifestPath = join(directory, `manifest-${key}.json`);
  const tempManifestPath = `${manifestPath}.tmp`;
  try {
    await writeFile(vectorsPath, new Uint8Array(data.buffer), { flag: 'wx' });
    await writeFile(tempManifestPath, JSON.stringify(stored), { flag: 'wx' });
    await rename(tempManifestPath, manifestPath);
  } catch (error) {
    await removeQuietly(tempManifestPath);
    await removeQuietly(vectorsPath);

    return writeFailed('The index cannot be written', error);
  }

  await removeSuperseded(directory, { generation, key }, base?.key, lock);

  return { status: 'applied', generation };
}
