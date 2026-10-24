import { join } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { readBoundedBytes } from '../bounded-read';
import { resolveSpecificationForRead } from '../discovery';
import {
  SpecificationError,
  parseSpecificationManifestText,
  type SpecificationLocation,
  type SpecificationManifest,
} from '../model';
import { deriveUnclassifiedDocumentId, isDerivedDocumentId } from './document-ids';
import { isReservedRootName } from './document-paths';
import { listSpecificationFiles } from './directory-scan';
import { DocumentError } from './errors';
import { MANIFEST_MAX_BYTES } from './limits';
import { assertCanonicalDirectory, openVerifiedFile, type VerifiedFs } from './verified-file';

const MANIFEST_NAME = 'specification.yaml';

export interface LoadedSpecification {
  readonly specId: string;
  readonly slug: string;
  readonly location: SpecificationLocation;
  readonly workspaceRoot: string;
  /** Canonical physical path of the Specification directory. */
  readonly specDir: string;
  readonly manifest: SpecificationManifest;
  /** The exact bytes `manifest` was parsed from (read once). */
  readonly manifestBytes: Buffer;
}

/**
 * Resolve the Specification, verify its directory and read + parse its manifest once.
 * `DOCUMENT_NOT_FOUND` for an unknown id, `SPEC_SOURCE_UNAVAILABLE` for an unavailable workspace,
 * a missing or redirected directory or a manifest that changed identity. An invalid manifest is a
 * `SpecificationError` (`SPEC_SOURCE_INVALID`), which transports treat as an unavailable source.
 */
export async function loadSpecification(
  engine: SpecFlowEngine,
  specId: string,
  fs: VerifiedFs,
): Promise<LoadedSpecification> {
  let discovered;
  try {
    discovered = await resolveSpecificationForRead(engine, specId);
  } catch (error) {
    // An id that cannot name a Specification is as unknown as one that names none.
    if (
      error instanceof SpecificationError &&
      (error.code === 'SPEC_NOT_FOUND' || error.code === 'SPEC_VALIDATION_ERROR')
    ) {
      throw new DocumentError('DOCUMENT_NOT_FOUND', 'The Specification does not exist.');
    }
    throw error;
  }
  if (discovered.status !== 'available') {
    throw new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The Specification source is unavailable.');
  }
  const { specification, workspaceRoot } = discovered;
  const specDir = join(workspaceRoot, 'specs', specification.location, specification.slug);
  await assertCanonicalDirectory(fs, specDir);

  const opened = await openVerifiedFile(fs, specDir, MANIFEST_NAME);
  if (opened.state !== 'opened') {
    throw new DocumentError(
      'SPEC_SOURCE_UNAVAILABLE',
      'The Specification manifest is unavailable.',
    );
  }
  let manifestBytes: Buffer;
  try {
    manifestBytes = await readBoundedBytes(opened.handle, MANIFEST_MAX_BYTES);
  } finally {
    await opened.handle.close();
  }
  const manifest = parseSpecificationManifestText(
    manifestBytes.toString('utf8'),
    specification.slug,
    specification.location,
  );
  if (manifest.specId !== specId) {
    throw new DocumentError(
      'SPEC_SOURCE_UNAVAILABLE',
      'The Specification manifest changed while it was being read.',
    );
  }
  return {
    specId,
    slug: specification.slug,
    location: specification.location,
    workspaceRoot,
    specDir,
    manifest,
    manifestBytes,
  };
}

interface LocatedDocument {
  readonly id: string;
  readonly path: string;
  readonly classification: 'registered' | 'unclassified';
  readonly type?: string;
}

/**
 * Find a document by id: a registry id from the manifest, or a derived `u-` id recomputed over the
 * listed files (a registered path never answers to a derived id). `DOCUMENT_NOT_FOUND` otherwise.
 */
export async function locateDocument(
  loaded: LoadedSpecification,
  documentId: string,
): Promise<LocatedDocument> {
  const entry = loaded.manifest.documents.find((document) => document.id === documentId);
  if (entry) {
    return { id: entry.id, path: entry.path, classification: 'registered', type: entry.type };
  }
  if (isDerivedDocumentId(documentId)) {
    const registeredPaths = new Set(loaded.manifest.documents.map((document) => document.path));
    const listed = await listSpecificationFiles(loaded.specDir);
    const matches = listed.paths.filter(
      (candidate) =>
        !registeredPaths.has(candidate) &&
        !(!candidate.includes('/') && isReservedRootName(candidate)) &&
        deriveUnclassifiedDocumentId(candidate) === documentId,
    );
    // Two files with one derived id cannot happen in practice (128 bits); if it ever does, neither
    // is served rather than the wrong one.
    if (matches.length > 1) {
      throw new DocumentError(
        'SPEC_SOURCE_UNAVAILABLE',
        'Two files of the Specification derive the same document id.',
      );
    }
    const path = matches[0];
    if (path !== undefined) return { id: documentId, path, classification: 'unclassified' };
  }
  throw new DocumentError('DOCUMENT_NOT_FOUND', 'The document does not exist.');
}
