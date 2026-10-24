import { createHash } from 'node:crypto';

import type {
  Action,
  ActionReason,
  ContentKind,
  DocumentIssue,
  DocumentTree,
} from '@nevo/specflow-contracts/documents';

import type { ManifestArchetype, ManifestDocument, SpecificationLocation } from '../model';
import { deriveUnclassifiedDocumentId } from './document-ids';
import { DocumentError } from './errors';
import {
  deriveFolders,
  findCaseCollisions,
  foldPathKey,
  isReservedRootName,
} from './document-paths';
import { validateDocuments } from './document-validation';
import { EDITABLE_EXTENSIONS, isEditable } from './content-kinds';
import { folderContainsProtectedDocument, isProtectedDocument } from './protection';

/**
 * Pure tree projection (`docs/architecture/runtime/specification-documents.md`: validation results, content kinds,
 * overview protection; `docs/reference/api/specification-documents.md`: tree). A function of the manifest, the facts the filesystem reader observed and the
 * advisory policy fact; it performs no I/O. The readers (`tree-reader.ts`) gather the facts.
 */

/** A regular file observed in the Specification directory (never a symlink, special or hidden entry). */
export interface ObservedFile {
  /** Portable relative path, POSIX separators. */
  readonly path: string;
  readonly size: number;
  /** sha256 of the content up to the hash limit, else a stat signature (`Limits`). */
  readonly revision: string;
  readonly kind: ContentKind;
  readonly mediaType: string;
}

/** Why a write is advisory-unavailable because of the project Git policy (read-only evaluation). */
export type PolicyReason = Extract<
  ActionReason,
  'branch-protected' | 'branch-not-allowed' | 'git-policy-invalid'
>;

export interface ArchiveLimitFact {
  readonly exceeded: boolean;
  /** The file above the archive per-file limit, when that is the cause. */
  readonly path?: string;
}

export interface TreeProjectionInput {
  readonly manifest: {
    readonly archetype: ManifestArchetype;
    readonly documents: readonly ManifestDocument[];
    readonly folders: readonly string[];
  };
  /** Display title of the archetype from the catalogue; absent when the archetype is not in it. */
  readonly archetypeTitle?: string;
  /** The exact bytes of `specification.yaml` that `manifest` was parsed from. */
  readonly manifestBytes: Uint8Array;
  readonly location: SpecificationLocation;
  readonly files: readonly ObservedFile[];
  /** The listing stopped at a limit (file count or depth). */
  readonly truncated: boolean;
  /** Symlinks and special entries found by the archive count traversal. */
  readonly skippedEntries: number;
  /** Paths of (at most a bounded number of) skipped entries, for the `skipped-entry` issues. */
  readonly skippedPaths: readonly string[];
  /**
   * Registered paths whose file is present but not safely readable (a subset of the skipped entries,
   * complete even when `skippedPaths` is capped). Reported as skipped only: never dangling.
   */
  readonly unreadableRegisteredPaths?: readonly string[];
  readonly archiveLimit: ArchiveLimitFact;
  /** Absent when Git is disabled, the branch is allowed, or the branch is not cheaply known. */
  readonly policyReason?: PolicyReason;
}

const TEXT_FORMATS: readonly string[] = [...EDITABLE_EXTENSIONS];

/** Response-affecting inputs besides the manifest and the file revisions (see {@link computeTreeRevision}). */
export type TreeRevisionContext = Pick<
  TreeProjectionInput,
  | 'location'
  | 'truncated'
  | 'skippedEntries'
  | 'skippedPaths'
  | 'archiveLimit'
  | 'policyReason'
  | 'archetypeTitle'
>;

/**
 * Tree revision (the tree `ETag`): sha256 over the manifest bytes, the sorted list of (path, revision)
 * pairs and every other input that changes the response: the location, truncation, the skipped entries
 * (count and reported paths), the archive limit fact, the advisory policy reason and the archetype
 * title. A conditional GET therefore never answers `304` for a response whose issues, advisory action
 * reasons or counts differ from the one the client holds.
 */
export function computeTreeRevision(
  manifestBytes: Uint8Array,
  files: readonly Pick<ObservedFile, 'path' | 'revision'>[],
  context?: TreeRevisionContext,
): string {
  // One JSON pair per line: an unclassified path may contain `:` and must not blur the boundary.
  const lines = files
    .map((file) => JSON.stringify([file.path, file.revision]))
    .sort(compareCodeUnits);
  return createHash('sha256')
    .update(manifestBytes)
    .update('\0')
    .update(lines.join('\n'), 'utf8')
    .update('\0')
    .update(context === undefined ? '' : JSON.stringify(contextFields(context)), 'utf8')
    .digest('hex');
}

function contextFields(context: TreeRevisionContext): unknown[] {
  return [
    context.location,
    context.truncated,
    context.skippedEntries,
    context.skippedPaths,
    context.archiveLimit.exceeded,
    context.archiveLimit.path ?? null,
    context.policyReason ?? null,
    context.archetypeTitle ?? null,
  ];
}

type WriteAction = (own?: ActionReason) => Action;

/**
 * Write actions have no route yet: `not-implemented` unless a stronger reason applies. An archived
 * Specification is read-only.
 */
// TODO(document write operations): drop the `not-implemented` reason when the write routes exist.
function writeActionFor(input: TreeProjectionInput): WriteAction {
  const archived = input.location === 'archive';
  return (own) => ({
    available: false,
    reason: archived ? 'archived' : (own ?? input.policyReason ?? 'not-implemented'),
  });
}

export function projectDocumentTree(input: TreeProjectionInput): DocumentTree {
  const { manifest } = input;
  const files = input.files.filter(
    (file) => !(!file.path.includes('/') && isReservedRootName(file.path)),
  );
  const filePaths = files.map((file) => file.path);
  const write = writeActionFor(input);
  const requirements = evaluateRequirements(manifest, filePaths, input.unreadableRegisteredPaths);

  const documents = projectDocumentNodes(input, files, write, requirements.minCountByType);
  const folders = projectFolders(deriveFolders(filePaths, manifest.folders), write);

  const dangling = requirements.validation.dangling.map(
    (entry): DocumentTree['dangling'][number] => ({
      id: entry.id,
      path: entry.path,
      type: entry.type,
      actions: {
        delete: write(
          isProtectedDocument({ id: entry.id, path: entry.path }) ? 'protected' : undefined,
        ),
      },
    }),
  );

  return {
    revision: computeTreeRevision(input.manifestBytes, files, input),
    archetype: {
      id: manifest.archetype.id,
      version: manifest.archetype.version,
      ...(input.archetypeTitle !== undefined ? { title: input.archetypeTitle } : {}),
    },
    folders,
    documents,
    dangling,
    completeness: {
      complete: requirements.validation.complete,
      requirements: [...requirements.validation.requirements],
    },
    capabilities: {
      createFile: write(),
      createFolder: write(),
      import: write(),
      classify: write(),
      formats: [...TEXT_FORMATS],
    },
    issues: collectIssues(input, requirements.validation.issues, filePaths),
    truncated: input.truncated,
    skippedEntries: input.skippedEntries,
  };
}

/** Validate the registry against the archetype and the observed files. */
function evaluateRequirements(
  manifest: TreeProjectionInput['manifest'],
  filePaths: readonly string[],
  unreadableRegisteredPaths?: readonly string[],
) {
  const validation = validateDocuments({
    archetype: manifest.archetype,
    documents: manifest.documents,
    observedPaths: filePaths,
    ...(unreadableRegisteredPaths !== undefined
      ? { unreadablePaths: unreadableRegisteredPaths }
      : {}),
  });
  const minCountByType = new Map(
    manifest.archetype.requirements.map((requirement) => [
      requirement.documentType,
      requirement.minCount,
    ]),
  );
  return { validation, minCountByType };
}

/** One node per observed file, sorted by folded path. */
function projectDocumentNodes(
  input: TreeProjectionInput,
  files: readonly ObservedFile[],
  write: WriteAction,
  minCountByType: ReadonlyMap<string, number>,
): DocumentTree['documents'] {
  const registeredByPath = new Map(
    input.manifest.documents.map((document) => [document.path, document]),
  );
  assertDistinctDerivedIds(files, registeredByPath);
  const archived = input.location === 'archive';

  return [...files]
    .sort((left, right) => compareByFoldedKey(left.path, right.path))
    .map((file): DocumentTree['documents'][number] => {
      const entry = registeredByPath.get(file.path);
      const isProtected =
        entry !== undefined && isProtectedDocument({ id: entry.id, path: entry.path });
      const protectedReason = isProtected ? ('protected' as const) : undefined;
      const minCount = entry ? (minCountByType.get(entry.type) ?? 0) : 0;
      return {
        id: entry ? entry.id : deriveUnclassifiedDocumentId(file.path),
        path: file.path,
        classification: entry ? 'registered' : 'unclassified',
        ...(entry ? { type: entry.type } : {}),
        kind: file.kind,
        mediaType: file.mediaType,
        size: file.size,
        revision: file.revision,
        protected: isProtected,
        editable: !archived && isEditable(file),
        satisfiesRequirement: entry !== undefined && minCount > 0,
        actions: {
          rename: write(protectedReason),
          move: write(protectedReason),
          delete: write(protectedReason),
          // A registered document is already classified: nothing to do, not a missing feature, so
          // no reason; an archived Specification is read-only like everything else.
          classify: entry ? (archived ? write() : { available: false }) : write(),
        },
      };
    });
}

/**
 * Derived ids are 128 bits of a hash of the exact path. A residual collision between two listed
 * files would make one of them unreachable (or the wrong one served): fail closed instead.
 */
function assertDistinctDerivedIds(
  files: readonly ObservedFile[],
  registeredByPath: ReadonlyMap<string, unknown>,
): void {
  const derivedPaths = new Map<string, string>();
  for (const file of files) {
    if (registeredByPath.has(file.path)) continue;
    const id = deriveUnclassifiedDocumentId(file.path);
    const other = derivedPaths.get(id);
    if (other !== undefined && other !== file.path) {
      throw new DocumentError(
        'SPEC_SOURCE_UNAVAILABLE',
        'Two files of the Specification derive the same document id.',
      );
    }
    derivedPaths.set(id, file.path);
  }
}

/** The root folder (rename, move and delete refused as `root`) followed by every derived folder. */
function projectFolders(
  folderPaths: readonly string[],
  write: WriteAction,
): DocumentTree['folders'] {
  return [
    {
      path: '',
      actions: { rename: write('root'), move: write('root'), delete: write('root') },
    },
    ...folderPaths.map((path) => ({
      path,
      actions: {
        rename: write(),
        move: write(),
        delete: write(folderContainsProtectedDocument(path) ? 'protected' : undefined),
      },
    })),
  ];
}

function collectIssues(
  input: TreeProjectionInput,
  validationIssues: readonly DocumentIssue[],
  filePaths: readonly string[],
): DocumentIssue[] {
  return [
    ...validationIssues,
    ...input.skippedPaths.map((path): DocumentIssue => ({ code: 'skipped-entry', path })),
    ...findCaseCollisions(filePaths).flatMap((group) =>
      group.map((path): DocumentIssue => ({ code: 'path-case-collision', path })),
    ),
    ...(input.archiveLimit.exceeded
      ? [
          {
            code: 'archive-limit',
            ...(input.archiveLimit.path !== undefined ? { path: input.archiveLimit.path } : {}),
          } satisfies DocumentIssue,
        ]
      : []),
  ];
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareByFoldedKey(left: string, right: string): number {
  const a = foldPathKey(left);
  const b = foldPathKey(right);
  if (a !== b) return a < b ? -1 : 1;
  return compareCodeUnits(left, right);
}
