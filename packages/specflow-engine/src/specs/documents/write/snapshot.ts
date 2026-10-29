import { createHash } from 'node:crypto';

import type { SpecFlowEngine } from '../../../application';
import { mapBounded } from '../../../concurrency';
import { isReservedRootName } from '../../document-rules/document-paths';
import { readAt, withOpenFile } from '../../document-rules/verified-file';
import { documentChangeError } from '../changes/errors';
import type { ObservedFile as PlanObservedFile, PlanningSnapshot } from '../changes/plan/snapshot';
import { listSpecificationFiles } from '../directory-scan';
import { loadSpecification, type LoadedSpecification } from '../loaded-specification';
import { observe } from '../observation';
import { resolveReadOptions, type DocumentReadOptions } from '../read-options';

const OBSERVATION_CONCURRENCY = 8;
const HASH_CHUNK_BYTES = 256 * 1024;

export interface SpecificationSnapshot {
  readonly loaded: LoadedSpecification;
  readonly snapshot: PlanningSnapshot;
}

/**
 * The planning snapshot of one Specification: ONE manifest read and one directory listing, then a
 * stat or hash of each file (the reader's revision memo applies). It is the same observation the
 * document tree is built from, so an `expectedRevision` a client took from the tree compares equal.
 * Not an atomic snapshot; the reservation re-checks under the control lock. A listing that was cut
 * short cannot prove the absence of a name, so it is refused rather than planned against.
 *
 * `hashPaths` names files whose revision is a stat signature (larger than the content-hash limit) but
 * whose content hash a plan needs as the `pre` state (a rename, move, delete or replacement of them);
 * they are streamed through the verified filesystem. Other large files keep their signature in the
 * `sha256` field, which no plan of an operation that does not name them uses.
 */
export async function readSpecificationSnapshot(
  engine: SpecFlowEngine,
  specId: string,
  options: DocumentReadOptions = {},
  hashPaths?: (snapshot: PlanningSnapshot) => readonly string[],
): Promise<SpecificationSnapshot> {
  const resolved = resolveReadOptions(options);
  const loaded = await loadSpecification(engine, specId, resolved.fs);
  const listed = await listSpecificationFiles(loaded.specDir);
  if (listed.truncated) {
    throw documentChangeError(
      'limit-exceeded',
      'The Specification holds too many files to be changed here.',
    );
  }

  const registered = loaded.manifest.documents.map((document) => document.path);
  const candidates = [...new Set([...listed.paths, ...registered])].filter(
    (path) => !(!path.includes('/') && isReservedRootName(path)),
  );
  const observations = await mapBounded(candidates, OBSERVATION_CONCURRENCY, (path) =>
    observe(loaded, path, resolved),
  );
  const files: PlanObservedFile[] = [];
  for (const observation of observations) {
    if (observation.kind !== 'file') {
      continue;
    }

    const { path, revision, size } = observation.file;
    files.push({ path, revision, bytes: size, sha256: revision });
  }

  const snapshot: PlanningSnapshot = {
    manifest: loaded.manifest,
    manifestText: loaded.manifestBytes.toString('utf8'),
    files,
  };
  const wanted = new Set(hashPaths?.(snapshot) ?? []);
  const needed = files.filter((file) => file.revision.startsWith('stat:') && wanted.has(file.path));
  if (needed.length === 0) {
    return { loaded, snapshot };
  }

  const hashes = new Map<string, string>();
  for (const file of needed) {
    const outcome = await withOpenFile(resolved.fs, loaded.specDir, file.path, async (open) => {
      const hash = createHash('sha256');
      let position = 0;
      for (;;) {
        const chunk = await readAt(open.handle, position, HASH_CHUNK_BYTES);
        if (chunk.length === 0) {
          break;
        }

        hash.update(chunk);
        position += chunk.length;
      }

      return hash.digest('hex');
    });
    if (outcome.state !== 'opened') {
      throw documentChangeError('file-missing', 'A document file is unavailable.');
    }

    hashes.set(file.path, outcome.value);
  }

  return {
    loaded,
    snapshot: {
      ...snapshot,
      files: files.map((file) =>
        hashes.has(file.path) ? { ...file, sha256: hashes.get(file.path)! } : file,
      ),
    },
  };
}
