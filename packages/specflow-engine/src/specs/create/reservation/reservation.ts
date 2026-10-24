import { randomUUID } from 'node:crypto';

import type { SpecFlowEngine } from '../../../application';
import {
  assertSharedResourcesAvailable,
  resourcesForCreate,
  SharedResourceError,
} from '../../coordination/resources';
import {
  MAX_MANAGED_WORKSPACE_SPECIFICATIONS,
  inspectRegisteredWorkspace,
} from '../../../project/workspace/registry/registry';
import {
  inspectExplicitIntegrationDestination,
  type ExplicitIntegrationPreflight,
} from './integration-destination';
import { openVersionControl } from '../../../version-control';
import { readProjectGitPolicy } from '../../../version-control/worktrees/config';
import { admitExistingCreateCommit, admitNewWorktreeCreateCommit } from '../git/commit';
import { fingerprintCreateClientIntent, type CreateClientIntent } from '../intent';
import {
  CreateOperationError,
  listCreateJournals,
  publishCreateJournal,
  readCreateJournal,
  withCreateJournalLock,
  type CreateJournal,
} from '../journal';
import { removeExpiredCompletedCreateJournals } from '../journal/retention';
import { admitCreateArchetype, documentErrorOf } from '../admission';
import { getBuiltInCatalogue } from '../../archetypes/catalogue';
import { DocumentError } from '../../documents/errors';
import {
  CREATE_JOURNAL_GROWTH_HEADROOM_BYTES,
  CREATE_JOURNAL_MAX_BYTES,
} from '../../documents/limits';
import { CREATE_JOURNAL_VERSION } from '../journal/model';
import { writeCreatePayload } from '../journal/payload';
import { discoverSpecificationsForCreateAdmission } from '../../discovery';
import { isValidSpecificationId, validateSpecificationScaffoldInput } from '../../model';
import { ScaffoldValidationError, createSpecificationScaffold } from '../../scaffold';

/**
 * First lock winner owns the creation date and pinned Git effect plan.
 * Previous operationId is checked BEFORE a local clock or config default.
 */
export async function reserveCreateOperation(
  engine: SpecFlowEngine,
  intent: CreateClientIntent,
  operationId: string,
  creationDate: () => string,
  /** Contents of `intent.addedDocuments`, in order. Not needed to follow an existing operation. */
  addedContents: readonly string[] = [],
): Promise<{ readonly record: CreateJournal; readonly existing: boolean }> {
  // New physical target inspection is outside the Project Home lock.
  // Completed-op retries must not depend on the destination's current state.
  const previousOutsideLock = await readCreateJournal(engine.context, operationId);
  const explicit: ExplicitIntegrationPreflight | undefined =
    !previousOutsideLock &&
    intent.target.kind === 'new-worktree' &&
    intent.target.integrationTargetWorkspaceId !== undefined
      ? await inspectExplicitIntegrationDestination(
          engine,
          intent.target.integrationTargetWorkspaceId,
        )
      : undefined;
  return withCreateJournalLock(engine.context, async () => {
    // Retention sweep of settled journals under the reservation lock: bounded, Git-free, best effort.
    await removeExpiredCompletedCreateJournals(engine.context, { keepOperationId: operationId });
    const operations = await listCreateJournals(engine.context);
    const previous = operations.find((item) => item.operationId === operationId);
    if (previous) {
      const fingerprint = fingerprintCreateClientIntent(intent);
      if (previous.inputFingerprint !== fingerprint) {
        throw new CreateOperationError(
          'CREATE_CONFLICT',
          'OperationId was already used with different immutable inputs.',
        );
      }
      return { record: previous, existing: true };
    }

    // A new operation: the archetype part is admitted before anything is reserved or written. An
    // existing operation is replayed above regardless of the current catalogue.
    admitCreateArchetype(intent, addedContents);

    // Date generated once under Project Home lock, after checking no journal.
    const created = creationDate();
    validateSpecificationScaffoldInput({ title: intent.title, created });
    // Journal publication is serialized with this scan, but manifest bytes
    // are written outside that lock. Skip only owned in-progress publications.
    const canonical = await discoverSpecificationsForCreateAdmission(
      engine,
      writingSlugsByWorkspace(operations),
    );
    if (canonical.some((item) => item.status !== 'available')) {
      throw recovery('Cannot reserve new Spec while an existing canonical source is unavailable.');
    }
    const specId = randomUUID();
    const catalogue = getBuiltInCatalogue();
    const scaffold = scaffoldOf({
      specId,
      catalogue,
      title: intent.title,
      created,
      goal: intent.goal,
      slug: intent.slug,
      archetypeId: intent.archetype.id,
      optionalDocumentIds: intent.optionalDocumentIds,
      addedDocuments: intent.addedDocuments.map((document, index) => ({
        path: document.path,
        ...(document.type !== undefined ? { type: document.type } : {}),
        content: addedContents[index]!,
      })),
      folders: intent.folders,
    });
    if (
      canonical.some(
        (item) => item.status === 'available' && item.specification.slug === scaffold.slug,
      ) ||
      operations.some((item) => item.slug === scaffold.slug)
    ) {
      throw new CreateOperationError('CREATE_CONFLICT', 'Specification slug is already reserved.');
    }

    // With Git enabled the Engine commits the scaffold: every refusal below happens BEFORE a journal,
    // a file or a Git effect exists. With Git disabled none of this runs.
    const policy = (await readProjectGitPolicy(engine.context)).policy;
    let commit: CreateJournal['commit'];
    let target: CreateJournal['target'];
    let gitPlan: { readonly projectRoot: string; readonly gitInstanceId: string } | undefined;
    if (intent.target.kind === 'existing') {
      const existingWorkspaceId = intent.target.workspaceId;
      if (!isValidSpecificationId(existingWorkspaceId)) {
        throw new CreateOperationError('CREATE_OPERATION_INVALID', 'Invalid target workspaceId.');
      }
      const registry = await engine.readRegistry();
      const inspected = await inspectRegisteredWorkspace(
        engine.context,
        registry,
        intent.target.workspaceId,
      );
      if (inspected.status !== 'available') {
        throw recovery('Selected existing workspace is unavailable.');
      }
      if (inspected.workspace.kind === 'linked') {
        // Admission happens BEFORE publishing a Create journal, writing a
        // manifest or spawning Git. Count already bound Specs AND reserved
        // Create intents whose bindings have not yet committed. This runs
        // inside the shared Project Home lock and prevents two independent
        // processes from simultaneously consuming the final available slot.
        const bound = new Set(
          registry.specBindings
            .filter((binding) => binding.workspaceId === existingWorkspaceId)
            .map((binding) => binding.specId),
        );
        const pending = operations.filter(
          (operation) =>
            operation.target.workspaceId === existingWorkspaceId &&
            operation.stage !== 'completed' &&
            operation.stage !== 'registry-linked' &&
            !bound.has(operation.specId),
        ).length;
        if (bound.size + pending >= MAX_MANAGED_WORKSPACE_SPECIFICATIONS) {
          throw new CreateOperationError(
            'CREATE_CONFLICT',
            'Selected linked workspace has reached its capacity of ' +
              MAX_MANAGED_WORKSPACE_SPECIFICATIONS +
              ' canonical Specifications, including reserved Creates. Select another worktree.',
          );
        }
      }
      if (policy.enabled) {
        commit = {
          required: true,
          branch: await admitExistingCreateCommit(engine, {
            root: inspected.root,
            paths: scaffold.files.map((file) => file.relativePath),
            operationId,
            slug: scaffold.slug,
            title: intent.title,
            specId,
          }),
        };
      }
      target = {
        kind: 'existing',
        workspaceId: intent.target.workspaceId,
        workspaceRoot: inspected.root,
      };
    } else {
      if (intent.target.integrationTargetWorkspaceId !== undefined) {
        if (!explicit) {
          throw new CreateOperationError(
            'CREATE_CONFLICT',
            'Destination preflight was superseded by another reservation.',
          );
        }
        const registry = await engine.readRegistry();
        const chosen = registry.workspaces.find(
          (item) => item.workspaceId === explicit.destination.workspaceId,
        );
        if (
          registry.revision !== explicit.registryRevision ||
          !chosen ||
          chosen.instanceId !== explicit.destination.instanceId
        ) {
          throw new CreateOperationError(
            'CREATE_CONFLICT',
            'Destination checkout registration changed before Create reservation.',
          );
        }
      }
      const plan = await openVersionControl(engine).worktrees.plan({
        slug: scaffold.slug,
        shortId: specId.slice(0, 8),
        ...(intent.target.baseRef.kind === 'explicit'
          ? { baseRefOverride: intent.target.baseRef.value }
          : {}),
        ...(intent.target.branch.kind === 'explicit'
          ? { branchOverride: intent.target.branch.value }
          : {}),
      });
      if (
        operations.some(
          (item) =>
            item.target.kind === 'new-worktree' &&
            (branchesOverlap(item.target.branch, plan.branch) ||
              item.target.workspaceRoot.toLowerCase() === plan.targetPath.toLowerCase()),
        )
      ) {
        throw new CreateOperationError(
          'CREATE_CONFLICT',
          'Git branch or worktree path is reserved.',
        );
      }
      admitNewWorktreeCreateCommit(policy.commits, plan.branch);
      commit = { required: true, branch: plan.branch };
      target = {
        kind: 'new-worktree',
        workspaceId: randomUUID(),
        workspaceRoot: plan.targetPath,
        instanceId: randomUUID(),
        branch: plan.branch,
        baseCommit: plan.baseCommit,
        ...(explicit ? { integrationDestination: explicit.destination } : {}),
      };
      gitPlan = {
        projectRoot: plan.projectRoot,
        gitInstanceId: plan.gitInstanceId,
      };
    }

    const record: CreateJournal = {
      version: CREATE_JOURNAL_VERSION,
      projectId: engine.context.project.projectId,
      operationId,
      inputFingerprint: fingerprintCreateClientIntent(intent),
      requestIntent: intent,
      specId,
      slug: scaffold.slug,
      title: intent.title,
      created,
      startedAt: new Date().toISOString(),
      ...(intent.goal ? { goal: intent.goal } : {}),
      catalogueRevision: catalogue.revision,
      documentIds: scaffold.documentIds,
      stage: 'reserved',
      target,
      ...(gitPlan ? { gitPlan } : {}),
      ...(commit ? { commit } : {}),
      files: scaffold.files.map(({ relativePath, sha256, bytes }) => ({
        relativePath,
        sha256,
        bytes,
      })),
    };
    try {
      await assertSharedResourcesAvailable(engine.context, resourcesForCreate(record));
    } catch (error) {
      if (error instanceof SharedResourceError) {
        throw new CreateOperationError(
          error.code === 'RESOURCE_CONFLICT' ? 'CREATE_CONFLICT' : 'CREATE_RECOVERY_REQUIRED',
          error.message,
        );
      }
      throw error;
    }
    assertJournalFitsItsCap(record);
    // The scaffold contents are durable in the hash-addressed payload store BEFORE the journal that
    // refers to them is published; a crash in between leaves only an orphan payload (swept later).
    await writeCreatePayload(
      engine.context,
      operationId,
      scaffold.files.map(({ sha256, content }) => ({ sha256, content })),
    );
    await publishCreateJournal(engine.context, record);
    return { record, existing: false };
  });
}

/**
 * The journal stays under the one exported cap, with headroom for the evidence later stages add.
 * Only paths, folders and ids can make it large (contents are not in it); a request that would not
 * fit is refused as an oversize request before anything is written.
 */
function assertJournalFitsItsCap(record: CreateJournal): void {
  const bytes = Buffer.byteLength(JSON.stringify(record, null, 2), 'utf8') + 1;
  if (bytes > CREATE_JOURNAL_MAX_BYTES - CREATE_JOURNAL_GROWTH_HEADROOM_BYTES) {
    throw new DocumentError(
      'DOCUMENT_OPERATION_INVALID',
      'The Create request has too many or too long paths to be recorded durably.',
    );
  }
}

/** Same scaffold the admission validated; a cause that only the real ids reveal maps the same way. */
function scaffoldOf(input: Parameters<typeof createSpecificationScaffold>[0]) {
  try {
    return createSpecificationScaffold(input);
  } catch (error) {
    if (error instanceof ScaffoldValidationError) throw documentErrorOf(error);
    throw error;
  }
}

function branchesOverlap(left: string, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}

function recovery(message: string): CreateOperationError {
  return new CreateOperationError('CREATE_RECOVERY_REQUIRED', message);
}

/**
 * Exact active publication scope derived from validated durable journals.
 * Called only with a Project Home control lock held, so stage transitions
 * cannot invalidate the snapshot during admission or completion checks.
 */
export function writingSlugsByWorkspace(
  operations: readonly CreateJournal[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const writingSlugs = new Map<string, Set<string>>();
  for (const item of operations) {
    if (item.stage !== 'manifest-writing') continue;
    const slugs = writingSlugs.get(item.target.workspaceRoot) ?? new Set<string>();
    slugs.add(item.slug);
    writingSlugs.set(item.target.workspaceRoot, slugs);
  }
  return writingSlugs;
}
