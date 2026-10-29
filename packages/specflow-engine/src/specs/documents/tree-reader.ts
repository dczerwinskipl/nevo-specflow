import type { DocumentTree } from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../application';
import { mapBounded } from '../../concurrency';
import { lookupProjectArchetype } from '../definitions/catalogue-source';
import { advisoryPolicyReason } from './advisory-policy';
import { readCommitPolicyMode } from './commit-policy';
import { countArchiveInventory, listSpecificationFiles, SKIPPED_PATHS_MAX } from './directory-scan';
import { isReservedRootName } from '../document-rules/document-paths';
import { loadSpecification, type LoadedSpecification } from './loaded-specification';
import { observe } from './observation';
import { projectDocumentTree, type ObservedFile, type PolicyReason } from './projection';
import { resolveReadOptions, type DocumentReadOptions } from './read-options';
import {
  commitSubjectOf,
  readDocumentCommitView,
  type CommitReadOptions,
} from './reads/commit-reader';

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

  return buildDocumentTree(engine, loaded, policyReason, options);
}

/** The tree of an already loaded Specification (the part of the read that needs no Engine). */
async function buildDocumentTree(
  engine: SpecFlowEngine,
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
    if (observation.kind === 'file') {
      files.push(observation.file);
    } else if (observation.kind === 'skipped') {
      perFileSkipped.push(observation.path);
    }
  }

  const archive = await countArchiveInventory(specDir);
  const traversalPaths = new Set(archive.skippedPaths);
  const extraSkipped = [...listed.unaddressable, ...perFileSkipped].filter(
    (path) => !traversalPaths.has(path),
  );
  const skippedPaths = [...archive.skippedPaths, ...extraSkipped].slice(0, SKIPPED_PATHS_MAX);
  const registeredPaths = new Set(manifest.documents.map((document) => document.path));
  const unreadableRegisteredPaths = perFileSkipped.filter((path) => registeredPaths.has(path));

  // One `lstat` of the archetype file plus the catalogue memo: no walk of the definitions folder.
  const archetype = await lookupProjectArchetype(engine, manifest.archetype.id);

  // The open commits are read last: a write that settled while the files were read is then seen as
  // settled, and the marker never outlives the commit it describes. Lock-free, no Git.
  const commits = await readDocumentCommitView(
    engine.context,
    commitSubjectOf(loaded),
    commitReadOptions(options, resolved.now, await readCommitPolicyMode(engine.context)),
  );

  return projectDocumentTree({
    manifest,
    ...(archetype.title !== undefined ? { archetypeTitle: archetype.title } : {}),
    archetypeDefined: archetype.state,
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
    commits,
  });
}

function commitReadOptions(
  options: DocumentReadOptions,
  now: () => number,
  policy: CommitReadOptions['policy'],
): CommitReadOptions {
  return {
    now,
    ...(policy !== undefined ? { policy } : {}),
    ...(options.processTable !== undefined ? { processTable: options.processTable } : {}),
  };
}
