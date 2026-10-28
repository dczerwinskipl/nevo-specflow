import type { SpecFlowEngine } from '../../../application';
import { openVersionControl } from '../../../version-control';
import type { CommitPort } from '../../../version-control/commits/port';
import { sha256Hex } from '../../../hash';
import { documentChangeError } from '../changes/errors';
import { planDocumentChange } from '../changes/plan';
import { resolveDocument, type PlanResult } from '../changes/plan/draft';
import type { DocumentChangeRequest, DocumentWriteRequest } from '../changes/plan/request';
import { manifestPathOf } from '../changes/plan/model';
import type { PlanningSnapshot } from '../changes/plan/snapshot';
import type { DocumentReadOptions } from '../read-options';
import { folderRevisionOf } from './folder-revision';
import { admitGitCommit, type GitAdmission, type GitPreflightOptions } from './git-preflight';
import { findManifestBaseline, assertManifestNotDirty } from './manifest-dirty';
import { assertPlanFitsWindows, type WindowsPathBoundOptions } from './path-bound';
import { readSpecificationSnapshot, type SpecificationSnapshot } from './snapshot';
import {
  asPlannerRequest,
  namesTemplates,
  templatesUnavailable,
  type TemplateResolver,
} from './template-port';

export interface DocumentAdmissionOptions {
  /** Filesystem, memo and clock seams of the readers. */
  readonly read?: DocumentReadOptions;
  readonly windows?: WindowsPathBoundOptions;
  /**
   * Planner seam: the catalogue revision a template create is compared with. Admission itself
   * resolves the project catalogue and uses its revision.
   */
  readonly currentCatalogueRevision?: string;
  /** Renders template entries of a create; supplied by the composition. */
  readonly templates?: TemplateResolver;
  /** The commit port (defaults to the Engine's own). */
  readonly commits?: CommitPort;
  readonly git?: GitPreflightOptions;
}

/**
 * A request that passed admission: the plan to reserve, the content to make durable first, and
 * what the reservation must re-check under the control lock. Nothing was written to get here.
 */
export interface AdmittedDocumentChange extends SpecificationSnapshot, PlanResult {
  /** sha256 of the manifest bytes the plan was made from (the reservation compares it). */
  readonly manifestSha256: string;
  readonly git: GitAdmission;
}

/**
 * Admission of a document change (ADR 0016; nothing is written, no journal, no
 * claim). Authorization is the Runtime's. In order: the Specification is resolved and read once,
 * `archive/` is refused, the request is planned against that read (input, limits, content rules,
 * path rules, collisions, protection of `overview`, every `expectedRevision`), the Windows path bound
 * holds, `SPEC_MANIFEST_DIRTY` is judged for a registry-changing plan, and with Git enabled the commit
 * port's preflight passes (cached for 2 s while the stat signatures hold).
 *
 * Git processes: none with Git disabled; none on a cache hit; a miss costs the preflight (five, six
 * above 100 paths); a registry-changing request with no pending manifest change adds the manifest's
 * path facts (two). The caller re-checks `manifestSha256` under the lock and re-plans once.
 */
export async function admitDocumentChange(
  engine: SpecFlowEngine,
  specId: string,
  written: DocumentWriteRequest,
  options: DocumentAdmissionOptions = {},
): Promise<AdmittedDocumentChange> {
  const request = asPlannerRequest(written);
  const observed = await readSpecificationSnapshot(engine, specId, options.read, (snapshot) =>
    pathsNeedingContentHash(snapshot, request),
  );
  const { loaded, snapshot } = observed;
  if (loaded.location !== 'active') {
    throw documentChangeError('archived', 'The Specification is archived and read-only.');
  }
  // A template entry is rendered from the project catalogue of the Project Home before planning.
  let planned = request;
  let catalogueRevision = options.currentCatalogueRevision;
  if (namesTemplates(written)) {
    if (options.templates === undefined) throw templatesUnavailable();
    const resolved = await options.templates(engine, snapshot.manifest, written);
    planned = resolved.request;
    catalogueRevision = resolved.catalogueRevision;
  }
  const result = planDocumentChange(snapshot, planned, {
    folderRevision: (folder) => folderRevisionOf(folder, snapshot.files, snapshot.manifest),
    ...(catalogueRevision !== undefined ? { currentCatalogueRevision: catalogueRevision } : {}),
  });
  assertPlanFitsWindows(loaded.workspaceRoot, result.plan, options.windows);

  const commits = options.commits ?? openVersionControl(engine).commits;
  const manifestPath = manifestPathOf(result.plan);
  const changesManifest = result.plan.paths.some((path) => path.path === manifestPath);
  const paths = result.plan.paths.map((path) => path.path);

  const git = await admitGitCommit(engine, commits, loaded.workspaceRoot, paths, options.git);
  if (changesManifest) {
    const baseline = await findManifestBaseline(engine.context, {
      workspaceId: loaded.workspaceId,
      specId: loaded.specId,
      manifestPath,
    });
    let cleanInGit: boolean | undefined;
    if (baseline.kind !== 'operation' && git.enabled) {
      try {
        const [fact] = await commits.pathFacts(loaded.workspaceRoot, [manifestPath]);
        cleanInGit = fact !== undefined && fact.working === fact.head;
      } catch (error) {
        // Without preflight (auto-commit off) the repository may be unreadable (an unborn branch):
        // then HEAD cannot vouch for the manifest and the ledger baseline stands on its own.
        if (git.mode === 'auto') throw error;
      }
    }
    assertManifestNotDirty({
      diskSha256: sha256Hex(loaded.manifestBytes),
      baseline,
      ...(cleanInGit !== undefined ? { cleanInGit } : {}),
    });
  }
  return { ...observed, ...result, manifestSha256: sha256Hex(loaded.manifestBytes), git };
}

/**
 * Files whose content hash the plan needs although their revision is a signature: the ones the
 * request replaces, renames, moves, deletes or classifies, and everything under a folder it names.
 */
function pathsNeedingContentHash(
  snapshot: PlanningSnapshot,
  request: DocumentChangeRequest,
): readonly string[] {
  const document = (documentId: string): string[] => {
    const resolved = resolveDocument(snapshot, documentId);
    if (resolved === undefined) return [];
    return [resolved.kind === 'registered' ? resolved.entry.path : resolved.file.path];
  };
  const under = (folder: string): string[] =>
    snapshot.files.filter((file) => file.path.startsWith(folder + '/')).map((file) => file.path);
  switch (request.action) {
    case 'save':
    case 'classify':
      return document(request.documentId);
    case 'save-all':
      return request.documents.flatMap((entry) => document(entry.documentId));
    case 'create':
    case 'folder':
      return [];
    case 'rename':
    case 'move':
    case 'delete':
      return request.target.kind === 'document'
        ? document(request.target.documentId)
        : under(request.target.path);
    default: {
      const exhaustive: never = request;
      return exhaustive;
    }
  }
}
