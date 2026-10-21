import type {
  DemoCreateRequest,
  DemoCreateOptions,
  DemoOperationStatus,
  DemoCreatedSpec,
  DemoLocation,
} from '@nevo/specflow-contracts/demo';
import { isValidSpecSlug } from '@nevo/specflow-contracts/specs';
import { DemoOperationError, fingerprintInput, type DemoState } from '../../../demo/state';
import type { DemoDocuments } from '../../documents';
import {
  applyOptionsScenario,
  DemoTargetError,
  resolveTarget,
  seedCreateOptions,
  slugify,
  demoOptionsScenarios,
  type DemoOptionsScenario,
  type DemoScenario,
  type ResolvedTarget,
} from './create-options';

interface CreateOperation {
  fingerprint: string;
  status: DemoOperationStatus['status'];
  step?: string;
  workspaceId?: string;
  branch?: string;
  updatedAt: string;
  result?: DemoCreatedSpec;
  commit?: () => DemoCreatedSpec;
}

/**
 * Specs-owned demo operations over the shared demo state: the workspace registry and create-options
 * scenarios, atomic specification creation with idempotency and operation inspection. Document
 * validation and seeding go through the narrow documents API (`plan`, `append`).
 */
export function createDemoSpecs(
  state: DemoState,
  documents: Pick<DemoDocuments, 'plan' | 'append'>,
) {
  const { catalogue, specifications, locations } = state;
  const liveOptions: DemoCreateOptions = seedCreateOptions();
  const operations = new Map<string, CreateOperation>();
  const { plan, append } = documents;
  const stale = state.stale;
  const fail = state.fail;
  const id = state.id;
  const uuid = state.uuid;
  const optionsFor = (scenarios: readonly DemoScenario[]): DemoCreateOptions => {
    const scenario = scenarios.find((name): name is DemoOptionsScenario =>
      (demoOptionsScenarios as readonly string[]).includes(name),
    );
    return applyOptionsScenario(liveOptions, scenario ?? 'default');
  };
  const forcedFailure = (
    scenarios: readonly DemoScenario[],
    target: DemoCreateRequest['target'],
  ) => {
    if (scenarios.includes('forbidden')) throw new DemoTargetError(403, 'forbidden', 'forbidden');
    if (scenarios.includes('stale-workspace'))
      throw new DemoTargetError(
        409,
        'DEMO_WORKSPACE_UNAVAILABLE',
        'Wybrane środowisko pracy nie jest już dostępne.',
      );
    if (scenarios.includes('integration-target-unavailable'))
      throw new DemoTargetError(400, 'CREATE_OPERATION_INVALID', 'CREATE_OPERATION_INVALID');
    if (scenarios.includes('base-ref-unavailable'))
      throw new DemoTargetError(422, 'BASE_REF_NOT_FOUND', 'BASE_REF_NOT_FOUND');
    if (scenarios.includes('branch-taken') && target?.kind === 'new-worktree')
      throw new DemoTargetError(409, 'BRANCH_ALREADY_EXISTS', 'BRANCH_ALREADY_EXISTS');
  };
  const createWithOutcome = (
    subject: string,
    input: DemoCreateRequest,
    scenarios: readonly DemoScenario[] = [],
  ): { result: DemoCreatedSpec; fresh: boolean } => {
    // Idempotency first: an operation already known for this subject is answered from its record,
    // whatever the catalogue revision is now. Only a NEW operation is validated against the
    // current catalogue.
    const operationId = input.operationId;
    const operationKey = JSON.stringify([subject, operationId]);
    const previous = operations.get(operationKey);
    if (previous && previous.fingerprint !== fingerprintInput(input))
      throw new DemoTargetError(409, 'CREATE_CONFLICT', 'CREATE_CONFLICT');
    if (previous?.status === 'completed') return { result: previous.result!, fresh: false };
    if (previous?.status === 'recovery-required') {
      if (scenarios.includes('recovery-resolved'))
        return { result: previous.commit!(), fresh: false };
      throw new DemoTargetError(503, 'CREATE_RECOVERY_REQUIRED', 'CREATE_RECOVERY_REQUIRED');
    }
    stale(input.catalogueRevision);
    const archetype = catalogue.archetypes.find(
      (a) => a.id === input.archetypeId && a.version === input.archetypeVersion,
    );
    if (!archetype) throw new DemoOperationError(409, 'demo_catalogue_stale');
    if (
      !input.title.trim() ||
      input.optionalDocumentIds.some(
        (d) => !archetype.documents.some((t) => t.id === d && !t.required),
      )
    )
      throw new DemoOperationError(400, 'demo_invalid_selection');
    forcedFailure(scenarios, input.target);
    const usedSlugs = new Set([...specifications.values()].map((spec) => spec.slug));
    let slug: string;
    if (input.slug !== undefined) {
      // An explicit slug is never silently renamed (like the Engine): a taken one conflicts.
      if (!isValidSpecSlug(input.slug))
        throw new DemoTargetError(400, 'CREATE_OPERATION_INVALID', 'CREATE_OPERATION_INVALID');
      if (usedSlugs.has(input.slug))
        throw new DemoTargetError(409, 'CREATE_CONFLICT', 'CREATE_CONFLICT');
      slug = input.slug;
    } else {
      const baseSlug = slugify(input.title);
      slug = baseSlug;
      for (let n = 2; usedSlugs.has(slug); n += 1) slug = baseSlug + '-' + n;
    }
    const resolved: ResolvedTarget = resolveTarget(optionsFor(scenarios), input.target, slug);
    const selectedPaths = archetype.documents
      .filter((d) => d.required || input.optionalDocumentIds.includes(d.id))
      .map((d) => d.filename);
    const additions =
      input.addedDocuments?.length || input.folders?.length
        ? plan(selectedPaths, [], { documents: input.addedDocuments ?? [], folders: input.folders })
        : { documents: [], folders: [] };
    fail('create', 'demo_specification_creation_failed');
    const newWorkspaceId = resolved.kind === 'new-worktree' ? uuid() : undefined;
    const workspaceId = (newWorkspaceId ?? resolved.workspaceId)!;
    const commit = (): DemoCreatedSpec => {
      const specId = 'demo-' + id();
      const documents = new Map(
        archetype.documents
          .filter((d) => d.required || input.optionalDocumentIds.includes(d.id))
          .map((d) => {
            const documentId = 'document-' + id();
            return [
              documentId,
              {
                id: documentId,
                title: d.title,
                filename: d.filename,
                content: d.content,
                revision: '1',
                required: d.required,
              },
            ] as const;
          }),
      );
      append(documents, additions.documents);
      let branch: string | undefined;
      if (resolved.kind === 'new-worktree') {
        branch = resolved.branch!;
        // Only an explicit `integrationTargetWorkspaceId` creates a pin: `{ target, its branch now }`.
        // No selector = no pin (Close follows the project target through the primary workspace).
        const pinned = resolved.integrationTargetWorkspaceId
          ? liveOptions.workspaces.find(
              (w) => w.workspaceId === resolved.integrationTargetWorkspaceId,
            )
          : undefined;
        liveOptions.workspaces.push({
          workspaceId,
          kind: 'linked',
          name: slug,
          path: `${liveOptions.worktreesRoot.path}/${slug}`,
          managed: true,
          specCount: 1,
          state: 'available',
          selectable: true,
          integrationSelectable: true,
          ...(pinned?.branch
            ? { integrationDestination: { workspaceId: pinned.workspaceId, branch: pinned.branch } }
            : {}),
          branch,
        });
        liveOptions.baseRefs.push({ ref: branch, checkedOutWorkspaceId: workspaceId });
      } else {
        const workspace = liveOptions.workspaces.find((w) => w.workspaceId === workspaceId)!;
        workspace.specCount += 1;
        branch = workspace.branch;
      }
      const location: DemoLocation =
        workspaceId !== liveOptions.primaryWorkspaceId
          ? {
              kind: 'simulated-worktree',
              path: '/demo/simulated/' + (branch ?? workspaceId),
              branch: branch ?? 'HEAD',
              simulated: true,
            }
          : { ...structuredClone(catalogue.currentLocation), ...(branch ? { branch } : {}) };
      specifications.set(specId, {
        record: {
          id: specId,
          title: input.title.trim(),
          updatedAt: state.now(),
          progress: { completed: 0, total: 0 },
          readyForWork: false,
          signals: [],
          currentExecutions: [],
        },
        archetype: archetype.title + ' v' + archetype.version,
        documents,
        folders: [
          ...new Set([
            ...additions.folders,
            ...selectedPaths.flatMap((path) => {
              const parts = path.split('/');
              return parts.slice(0, -1).map((_part, index) => parts.slice(0, index + 1).join('/'));
            }),
          ]),
        ],
        requiredPaths: archetype.documents.filter((d) => d.required).map((d) => d.filename),
        treeRevision: '1',
        location,
        workspaceId,
        ...(branch ? { branch } : {}),
        slug,
        ...(resolved.integrationTargetWorkspaceId
          ? { integrationTargetWorkspaceId: resolved.integrationTargetWorkspaceId }
          : {}),
      });
      // Atomic create resolves the place itself: there is no separate workplace stage.
      locations.set(specId, structuredClone(location));
      const result: DemoCreatedSpec = {
        specId,
        documentIds: [...documents.keys()],
        operationId,
        kind: 'specification-create',
        status: 'completed',
        slug,
        workspaceId,
        relativeManifestPath: 'specs/' + slug + '/manifest.json',
      };
      operations.set(operationKey, {
        fingerprint: fingerprintInput(input),
        status: 'completed',
        step: 'completed',
        workspaceId,
        ...(branch ? { branch } : {}),
        updatedAt: new Date().toISOString(),
        result,
      });
      return result;
    };
    if (scenarios.includes('recovery-required')) {
      operations.set(operationKey, {
        fingerprint: fingerprintInput(input),
        status: 'recovery-required',
        step: 'workspace-prepared',
        workspaceId,
        ...(resolved.branch ? { branch: resolved.branch } : {}),
        updatedAt: new Date().toISOString(),
        commit,
      });
      throw new DemoTargetError(503, 'CREATE_RECOVERY_REQUIRED', 'CREATE_RECOVERY_REQUIRED');
    }
    return { result: commit(), fresh: true };
  };
  return {
    /** Plain create. Throws on failure; see `createWithOutcome` for the HTTP seam. */
    create(
      subject: string,
      input: DemoCreateRequest,
      scenarios: readonly DemoScenario[] = [],
    ): DemoCreatedSpec {
      return createWithOutcome(subject, input, scenarios).result;
    },
    createWithOutcome,
    /** Registry snapshot, optionally reshaped by an options scenario. */
    createOptions(scenarios: readonly DemoScenario[] = []): DemoCreateOptions {
      return optionsFor(scenarios);
    },
    /** Demo-proposed operation status read (IMPLEMENTATION-SPEC 10.5). */
    operationStatus(
      subject: string,
      operationId: string,
      scenarios: readonly DemoScenario[] = [],
    ): DemoOperationStatus {
      const key = JSON.stringify([subject, operationId]);
      const pending = operations.get(key);
      if (pending?.status === 'recovery-required' && scenarios.includes('recovery-resolved'))
        pending.commit!();
      const operation = operations.get(key);
      if (!operation) return { operationId, status: 'not-started' };
      return {
        operationId,
        status: operation.status,
        ...(operation.step ? { step: operation.step } : {}),
        ...(operation.workspaceId ? { workspaceId: operation.workspaceId } : {}),
        ...(operation.branch ? { branch: operation.branch } : {}),
        updatedAt: operation.updatedAt,
        ...(operation.result ? { result: operation.result } : {}),
      };
    },
  };
}
export type DemoSpecs = ReturnType<typeof createDemoSpecs>;
