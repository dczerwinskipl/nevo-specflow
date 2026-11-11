import { readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { compareIds } from '../../../compare';
import type { VectorCandidate } from '../vector-math';
import {
  probeAfter,
  validateChange,
  type ApplyOutcome,
  type VectorStoreChange,
} from '../vector-store';
import { removeQuietly, removeSuperseded } from './cleanup';
import { generationFiles, generationKey } from './generation-files';
import { writeFailed } from './io-errors';
import { FILE_INDEX_SCHEMA_VERSION, type StoredManifest } from './manifest-file';
import { readSnapshot, type VectorsCache } from './snapshot';
import type { HeldWriterLock, WriterLockCheckpoint, WriterLockDependencies } from './writer-lock';

/**
 * One write of the lock holder `owner`: the new pair is named with its epoch (the fencing token) and
 * a generation above every manifest on disk. Ownership is checked once more right before the
 * manifest is published; a writer that lost the lock answers `conflict` without publishing. A
 * former holder that passes the check and publishes later anyway ranks below the new owner, whose
 * epoch is higher (`compareGenerations`).
 */
export async function applyChange(
  directory: string,
  change: VectorStoreChange,
  cache: VectorsCache,
  lock: WriterLockDependencies,
  owner: Pick<HeldWriterLock, 'epoch' | 'stillHeld'>,
  checkpoint?: WriterLockCheckpoint,
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
    // Above every manifest generation on disk, damaged and fenced-off ones included.
    const highest = Math.max(
      0,
      ...generationFiles(await readdir(directory)).map((file) => file.generation),
    );
    generation = Math.max(highest, base?.manifest.generation ?? 0) + 1;
  } catch (error) {
    return writeFailed('The index directory cannot be listed', error);
  }

  const key = generationKey(owner.epoch, generation);
  const probe = probeAfter(change, base?.manifest);
  const stored: StoredManifest = {
    schemaVersion: FILE_INDEX_SCHEMA_VERSION,
    generation,
    identity: change.identity,
    ...(probe ? { probe: [...probe] } : {}),
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
    if (!(await owner.stillHeld())) {
      await removeQuietly(tempManifestPath);
      await removeQuietly(vectorsPath);

      return { status: 'conflict' };
    }

    await checkpoint?.('publish');
    await rename(tempManifestPath, manifestPath);
  } catch (error) {
    await removeQuietly(tempManifestPath);
    await removeQuietly(vectorsPath);

    return writeFailed('The index cannot be written', error);
  }

  await removeSuperseded(directory, { epoch: owner.epoch, generation, key }, base?.key, lock);

  return { status: 'applied', generation };
}
