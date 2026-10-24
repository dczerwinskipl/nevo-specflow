import { join } from 'node:path';

import type { DocumentContent, DocumentTree } from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../application';
import { mapBounded } from '../../concurrency';
import { readBoundedBytes } from '../bounded-read';
import { resolveSpecificationForRead } from '../discovery';
import { getBuiltInCatalogue } from '../archetypes';
import {
  SpecificationError,
  parseSpecificationManifestText,
  type SpecificationLocation,
  type SpecificationManifest,
} from '../model';
import { advisoryPolicyReason } from './advisory-policy';
import { deriveUnclassifiedDocumentId, isDerivedDocumentId } from './document-ids';
import { isReservedRootName } from './document-paths';
import { deriveDocumentTitle } from './document-title';
import { EDITABLE_EXTENSIONS, extensionOf } from './content-kinds';
import { countArchiveInventory, listSpecificationFiles, SKIPPED_PATHS_MAX } from './directory-scan';
import { DocumentError } from './errors';
import { analyzeOpenFile, decodeText } from './file-analysis';
import { MANIFEST_MAX_BYTES, TEXT_CONTENT_MAX_BYTES } from './limits';
import { projectDocumentTree, type ObservedFile, type PolicyReason } from './projection';
import { RevisionMemo, memoKey } from './revision-memo';
import {
  assertCanonicalDirectory,
  inspectEntry,
  nodeVerifiedFs,
  openVerifiedFile,
  type VerifiedFs,
} from './verified-file';

/**
 * Filesystem reader of the documents layer (`docs/architecture/runtime/specification-documents.md`). Starts from the discovered Specification,
 * reads the manifest ONCE and builds the projection from that read, a directory listing and a
 * stat/hash of the files. It is not an atomic snapshot (documented read guarantee): every reported
 * field was true at some instant during the read, writes put the manifest last, and the tree
 * revision is computed from exactly the bytes and signatures that were read, so re-reading and
 * comparing revisions detects any change. No control lock, no Git process.
 */

export interface ObservationMemoValue {
  readonly size: number;
  readonly revision: string;
  readonly kind: ObservedFile['kind'];
  readonly mediaType: string;
}

/** What the workspace documents section needs of a file: its revision and derived title. */
export interface SummaryMemoValue {
  readonly revision: string;
  readonly title: string;
}

export interface DocumentReadOptions {
  /** Filesystem seam (fault injection in tests). */
  readonly fs?: VerifiedFs;
  /** Revision memo; defaults to a process-wide bounded LRU. */
  readonly memo?: RevisionMemo<ObservationMemoValue>;
  /** Memo of revisions and titles for the workspace documents section; defaults to a process-wide LRU. */
  readonly summaryMemo?: RevisionMemo<SummaryMemoValue>;
  readonly now?: () => number;
}

const processMemo = new RevisionMemo<ObservationMemoValue>();
const processSummaryMemo = new RevisionMemo<SummaryMemoValue>();
/** A file modified this recently is not memoised: its mtime may not move on a further write. */
const RECENT_WRITE_MS = 2000;
const ANALYSIS_CONCURRENCY = 8;
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
  fs: VerifiedFs = nodeVerifiedFs,
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

/** The full tree of one Specification (`GET .../document-tree`). */
export async function readSpecificationDocumentTree(
  engine: SpecFlowEngine,
  specId: string,
  options: DocumentReadOptions = {},
): Promise<DocumentTree> {
  const loaded = await loadSpecification(engine, specId, options.fs ?? nodeVerifiedFs);
  const policyReason = await advisoryPolicyReason(engine, loaded.workspaceRoot);
  return buildDocumentTree(loaded, policyReason, options);
}

/** The tree of an already loaded Specification (the part of the read that needs no Engine). */
export async function buildDocumentTree(
  loaded: LoadedSpecification,
  policyReason: PolicyReason | undefined,
  options: DocumentReadOptions = {},
): Promise<DocumentTree> {
  const fs = options.fs ?? nodeVerifiedFs;
  const { manifest, specDir } = loaded;

  const listed = await listSpecificationFiles(specDir);
  const listedSet = new Set(listed.paths);
  // Registered documents beyond the listing cap are still stat'ed directly: a registered file is
  // never reported dangling just because the listing stopped before it.
  const candidates = [
    ...listed.paths,
    ...manifest.documents.map((document) => document.path).filter((path) => !listedSet.has(path)),
  ].filter((path) => !(!path.includes('/') && isReservedRootName(path)));

  const results = await mapBounded(candidates, ANALYSIS_CONCURRENCY, (path) =>
    observe(loaded, path, fs, options),
  );
  const files: ObservedFile[] = [];
  const perFileSkipped: string[] = [];
  for (const [index, result] of results.entries()) {
    if (result === 'skipped') perFileSkipped.push(candidates[index]!);
    else if (result !== 'vanished') files.push(result);
  }

  const archive = await countArchiveInventory(specDir);
  const traversalPaths = new Set(archive.skippedPaths);
  const extraSkipped = [...listed.unaddressable, ...perFileSkipped].filter(
    (path) => !traversalPaths.has(path),
  );
  const skippedPaths = [...archive.skippedPaths, ...extraSkipped].slice(0, SKIPPED_PATHS_MAX);

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
    archiveLimit: {
      exceeded: archive.exceeded,
      ...(archive.oversizedPath !== undefined ? { path: archive.oversizedPath } : {}),
    },
    ...(policyReason !== undefined ? { policyReason } : {}),
  });
}

/** `vanished`: gone since the listing (not reported). `skipped`: present but not safely readable. */
async function observe(
  loaded: LoadedSpecification,
  path: string,
  fs: VerifiedFs,
  options: DocumentReadOptions,
): Promise<ObservedFile | 'vanished' | 'skipped'> {
  const entry = await inspectEntry(fs, loaded.specDir, path);
  if (entry.state === 'absent') return 'vanished';
  if (entry.state !== 'file') return 'skipped';
  const memo = options.memo ?? processMemo;
  const key = memoKey(join(loaded.specDir, path), entry.stat);
  const cached = memo.get(key);
  if (cached) return { path, ...cached };

  let opened;
  try {
    opened = await openVerifiedFile(fs, loaded.specDir, path);
  } catch (error) {
    if (error instanceof DocumentError) return 'skipped';
    throw error;
  }
  if (opened.state === 'absent') return 'vanished';
  if (opened.state !== 'opened') return 'skipped';
  try {
    const analysis = await analyzeOpenFile(opened.handle, opened.stat, path);
    const value: ObservationMemoValue = {
      size: analysis.size,
      revision: analysis.revision,
      kind: analysis.kind,
      mediaType: analysis.mediaType,
    };
    const modifiedMs = Number(opened.stat.mtimeNs / 1_000_000n);
    if ((options.now?.() ?? Date.now()) - modifiedMs >= RECENT_WRITE_MS) memo.set(key, value);
    return { path, ...value };
  } catch (error) {
    if (isGone(error)) return 'vanished';
    throw error;
  } finally {
    await opened.handle.close().catch(() => undefined);
  }
}

function isGone(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  return code === 'ENOENT';
}

export interface LocatedDocument {
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

export interface ReadDocumentOptions extends DocumentReadOptions {
  /** `?revision=`: anything but the current revision is `DOCUMENT_REVISION_UNAVAILABLE`. */
  readonly revision?: string;
}

/** One document as JSON (`GET .../documents/:documentId`). */
export async function readSpecificationDocument(
  engine: SpecFlowEngine,
  specId: string,
  documentId: string,
  options: ReadDocumentOptions = {},
): Promise<DocumentContent> {
  const loaded = await loadSpecification(engine, specId, options.fs ?? nodeVerifiedFs);
  return readDocumentOfLoaded(loaded, documentId, options);
}

/** One document of an already loaded Specification. */
export async function readDocumentOfLoaded(
  loaded: LoadedSpecification,
  documentId: string,
  options: ReadDocumentOptions = {},
): Promise<DocumentContent> {
  const fs = options.fs ?? nodeVerifiedFs;
  const located = await locateDocument(loaded, documentId);
  const opened = await openVerifiedFile(fs, loaded.specDir, located.path);
  if (opened.state !== 'opened') {
    throw new DocumentError('DOCUMENT_FILE_MISSING', 'The document has no file.');
  }
  try {
    const analysis = await analyzeOpenFile(opened.handle, opened.stat, located.path);
    if (options.revision !== undefined && options.revision !== analysis.revision) {
      throw new DocumentError(
        'DOCUMENT_REVISION_UNAVAILABLE',
        'The requested revision is not the current one.',
      );
    }
    if (analysis.kind === 'text' && analysis.size > TEXT_CONTENT_MAX_BYTES) {
      throw new DocumentError(
        'DOCUMENT_TOO_LARGE',
        'The document is too large to read as JSON; use the raw endpoint.',
      );
    }
    const content =
      analysis.kind === 'text' && analysis.bytes ? decodeText(analysis.bytes) : undefined;
    const extension = extensionOf(located.path);
    return {
      id: located.id,
      path: located.path,
      title: deriveDocumentTitle(located.path, content),
      classification: located.classification,
      ...(located.type !== undefined ? { type: located.type } : {}),
      kind: analysis.kind,
      mediaType: analysis.mediaType,
      size: analysis.size,
      revision: analysis.revision,
      editable:
        loaded.location === 'active' &&
        analysis.kind === 'text' &&
        (EDITABLE_EXTENSIONS as readonly string[]).includes(extension) &&
        analysis.size <= TEXT_CONTENT_MAX_BYTES,
      ...(content !== undefined ? { content } : {}),
    };
  } finally {
    await opened.handle.close().catch(() => undefined);
  }
}

export interface RegisteredDocumentSummary {
  readonly id: string;
  readonly path: string;
  readonly type: string;
  readonly title: string;
  readonly revision: string;
}

/**
 * Registered documents whose file exists, with their derived titles (the workspace `documents`
 * section). Unclassified and dangling entries are not part of it. Files that cannot be read safely are
 * left out rather than failing the section.
 */
export async function readRegisteredDocumentSummaries(
  engine: SpecFlowEngine,
  specId: string,
  options: DocumentReadOptions = {},
): Promise<readonly RegisteredDocumentSummary[]> {
  const loaded = await loadSpecification(engine, specId, options.fs ?? nodeVerifiedFs);
  return summariesOfLoaded(loaded, options);
}

/** Registered document summaries of an already loaded Specification. */
export async function summariesOfLoaded(
  loaded: LoadedSpecification,
  options: DocumentReadOptions = {},
): Promise<readonly RegisteredDocumentSummary[]> {
  const fs = options.fs ?? nodeVerifiedFs;
  const memo = options.summaryMemo ?? processSummaryMemo;
  const rows = await mapBounded(
    loaded.manifest.documents,
    ANALYSIS_CONCURRENCY,
    async (document): Promise<RegisteredDocumentSummary | undefined> => {
      const summary = (value: SummaryMemoValue): RegisteredDocumentSummary => ({
        id: document.id,
        path: document.path,
        type: document.type,
        ...value,
      });
      // An unchanged old file (same path, size, mtime and inode) is answered from the memo with one
      // stat: the section does not open and hash every registered file on every request.
      const entry = await inspectEntry(fs, loaded.specDir, document.path);
      if (entry.state !== 'file') return undefined;
      const key = memoKey(join(loaded.specDir, document.path), entry.stat);
      const cached = memo.get(key);
      if (cached) return summary(cached);

      let opened;
      try {
        opened = await openVerifiedFile(fs, loaded.specDir, document.path);
      } catch (error) {
        if (error instanceof DocumentError) return undefined;
        throw error;
      }
      if (opened.state !== 'opened') return undefined;
      try {
        const analysis = await analyzeOpenFile(opened.handle, opened.stat, document.path);
        const content =
          analysis.kind === 'text' && analysis.bytes ? decodeText(analysis.bytes) : undefined;
        const value: SummaryMemoValue = {
          title: deriveDocumentTitle(document.path, content),
          revision: analysis.revision,
        };
        const modifiedMs = Number(opened.stat.mtimeNs / 1_000_000n);
        if ((options.now?.() ?? Date.now()) - modifiedMs >= RECENT_WRITE_MS) {
          memo.set(memoKey(join(loaded.specDir, document.path), opened.stat), value);
        }
        return summary(value);
      } finally {
        await opened.handle.close().catch(() => undefined);
      }
    },
  );
  return rows.filter((row): row is RegisteredDocumentSummary => row !== undefined);
}
