import type { DocumentTree } from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../application';
import { mapBounded } from '../../concurrency';
import { getBuiltInCatalogue } from '../archetypes';
import { advisoryPolicyReason } from './advisory-policy';
import { countArchiveInventory, listSpecificationFiles, SKIPPED_PATHS_MAX } from './directory-scan';
import { isReservedRootName } from './document-paths';
import { loadSpecification, type LoadedSpecification } from './loaded-specification';
import { observe } from './observation';
import { projectDocumentTree, type ObservedFile, type PolicyReason } from './projection';
import { resolveReadOptions, type DocumentReadOptions } from './read-options';

/**
 * Filesystem reader of the documents layer (`docs/architecture/runtime/specification-documents.md`).
 * Starts from the loaded Specification, reads the manifest ONCE and builds the projection from that
 * read, a directory listing and a stat/hash of the files. It is not an atomic snapshot (documented
 * read guarantee): every reported field was true at some instant during the read, writes put the
 * manifest last, and the tree revision is computed from exactly the bytes and signatures that were
 * read, so re-reading and comparing revisions detects any change. No control lock, no Git process.
 */

const ANALYSIS_CONCURRENCY = 8;

/** The full tree of one Specification (`GET .../document-tree`). */
export async function readSpecificationDocumentTree(
  engine: SpecFlowEngine,
  specId: string,
  options: DocumentReadOptions = {},
): Promise<DocumentTree> {
  const loaded = await loadSpecification(engine, specId, resolveReadOptions(options).fs);
  const policyReason = await advisoryPolicyReason(engine, loaded.workspaceRoot);
  return buildDocumentTree(loaded, policyReason, options);
}

/** The tree of an already loaded Specification (the part of the read that needs no Engine). */
async function buildDocumentTree(
  loaded: LoadedSpecification,
  policyReason: PolicyReason | undefined,
  options: DocumentReadOptions = {},
): Promise<DocumentTree> {
  const resolved = resolveReadOptions(options);
  const { manifest, specDir } = loaded;

  const listed = await listSpecificationFiles(specDir);
  const listedSet = new Set(listed.paths);
  // Registered documents beyond the listing cap are still stat'ed directly: a registered file is
  // never reported dangling just because the listing stopped before it.
  const candidates = [
    ...listed.paths,
    ...manifest.documents.map((document) => document.path).filter((path) => !listedSet.has(path)),
  ].filter((path) => !(!path.includes('/') && isReservedRootName(path)));

  const observations = await mapBounded(candidates, ANALYSIS_CONCURRENCY, (path) =>
    observe(loaded, path, resolved),
  );
  const files: ObservedFile[] = [];
  const perFileSkipped: string[] = [];
  for (const observation of observations) {
    if (observation.kind === 'file') files.push(observation.file);
    else if (observation.kind === 'skipped') perFileSkipped.push(observation.path);
  }

  const archive = await countArchiveInventory(specDir);
  const traversalPaths = new Set(archive.skippedPaths);
  const extraSkipped = [...listed.unaddressable, ...perFileSkipped].filter(
    (path) => !traversalPaths.has(path),
  );
  const skippedPaths = [...archive.skippedPaths, ...extraSkipped].slice(0, SKIPPED_PATHS_MAX);
  const registeredPaths = new Set(manifest.documents.map((document) => document.path));
  const unreadableRegisteredPaths = perFileSkipped.filter((path) => registeredPaths.has(path));

  const archetypeTitle = getBuiltInCatalogue().findArchetype(manifest.archetype.id)?.title;

  return projectDocumentTree({
    manifest,
    ...(archetypeTitle !== undefined ? { archetypeTitle } : {}),
    manifestBytes: loaded.manifestBytes,
    location: loaded.location,
    files,
    truncated: listed.truncated,
    skippedEntries: archive.skippedCount + extraSkipped.length,
    skippedPaths,
    unreadableRegisteredPaths,
    archiveLimit: {
      exceeded: archive.exceeded,
      ...(archive.oversizedPath !== undefined ? { path: archive.oversizedPath } : {}),
    },
    ...(policyReason !== undefined ? { policyReason } : {}),
  });
}
