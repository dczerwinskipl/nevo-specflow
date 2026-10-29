import type {
  DemoCreateRequest,
  DemoCreateOptions,
  DemoOperationStatus,
  DemoCreatedSpec,
  DemoLocation,
} from '@nevo/specflow-contracts/demo';
import { isValidSpecSlug } from '@nevo/specflow-contracts/specs';
import { DocumentError } from '@nevo/specflow-engine';
import { fingerprintInput, type DemoState } from '../../../demo/state';
import type { DemoDocuments } from '../../documents';
import { DemoTargetError, demoSlugFor, resolveTarget, type ResolvedTarget } from './create-target';
import {
  applyOptionsScenario,
  demoOptionsScenarios,
  type DemoOptionsScenario,
  type DemoScenario,
} from './scenarios';
import { seedCreateOptions } from './seed';
import type { DemoOperationRecord } from './operation-list';

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
 * scenarios, atomic specification creation with idempotency and operation inspection. The
 * Specification's documents are validated and built by the narrow documents API (`scaffold`, the
 * Engine's own scaffold), so Create refuses with the real archetype and document codes.
 */
export function createDemoSpecs(state: DemoState, documents: Pick<DemoDocuments, 'scaffold'>) {
  const { catalogue, specifications, locations } = state;
  const liveOptions: DemoCreateOptions = seedCreateOptions();
  const operations = new Map<string, CreateOperation>();
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
    if (scenarios.includes('branch-protected'))
      throw new DemoTargetError(422, 'BRANCH_PROTECTED', 'BRANCH_PROTECTED');
    if (scenarios.includes('commit-blocked'))
      throw new DemoTargetError(409, 'COMMIT_BLOCKED', 'COMMIT_BLOCKED');
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
    // Archetype admission, in the Engine's order: a stale catalogue first, then the archetype and
    // its version; the templates, paths and limits are checked by the scaffold below.
    if (input.catalogueRevision !== catalogue.revision)
      throw new DocumentError('CATALOGUE_STALE', 'The archetype catalogue changed; reload it.');
    const archetype = catalogue.archetypes.find((a) => a.id === input.archetypeId);
    if (!archetype) throw new DocumentError('ARCHETYPE_UNKNOWN', 'Unknown archetype.');
    if (archetype.version !== input.archetypeVersion)
      throw new DocumentError('CATALOGUE_STALE', 'The archetype is at another version.');
    if (!input.title.trim())
      throw new DemoTargetError(400, 'CREATE_OPERATION_INVALID', 'CREATE_OPERATION_INVALID');
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
      const baseSlug = demoSlugFor(input.title);
      slug = baseSlug;
      for (let n = 2; usedSlugs.has(slug); n += 1) slug = baseSlug + '-' + n;
    }
    const resolved: ResolvedTarget = resolveTarget(optionsFor(scenarios), input.target, slug);
    const now = state.now();
    const created = /^\d{4}-\d{2}-\d{2}/u.test(now)
      ? now.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const scaffold = (specId: string) => {
      try {
        return documents.scaffold({
          specId,
          title: input.title,
          ...(input.goal !== undefined ? { goal: input.goal } : {}),
          slug,
          created,
          archetypeId: archetype.id,
          ...(input.optionalDocumentIds ? { optionalDocumentIds: input.optionalDocumentIds } : {}),
          ...(input.addedDocuments ? { addedDocuments: input.addedDocuments } : {}),
          ...(input.folders ? { folders: input.folders } : {}),
        });
      } catch (error) {
        if (error instanceof DocumentError) throw error;
        // An invalid title or slug is the Engine's SPEC_VALIDATION_ERROR: bad Create input.
        throw new DemoTargetError(400, 'CREATE_OPERATION_INVALID', 'CREATE_OPERATION_INVALID');
      }
    };
    // Validate before anything is created (the Engine admits the scaffold the same way).
    scaffold('demo-admission');
    fail('create', 'demo_specification_creation_failed');
    const newWorkspaceId = resolved.kind === 'new-worktree' ? uuid() : undefined;
    const workspaceId = (newWorkspaceId ?? resolved.workspaceId)!;
    const commit = (): DemoCreatedSpec => {
      const specId = 'demo-' + id();
      const built = scaffold(specId);
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
        documents: built.documents,
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
        documentIds: built.documentIds,
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
    if (scenarios.includes('commit-failed')) {
      // The files exist but the commit failed: the journal stays at commit-writing, so a re-submit
      // with the same operationId answers CREATE_RECOVERY_REQUIRED (like the Engine).
      operations.set(operationKey, {
        fingerprint: fingerprintInput(input),
        status: 'recovery-required',
        step: 'commit-writing',
        workspaceId,
        ...(resolved.branch ? { branch: resolved.branch } : {}),
        updatedAt: new Date().toISOString(),
        commit,
      });
      throw new DemoTargetError(503, 'COMMIT_FAILED', 'COMMIT_FAILED');
    }
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
    /** The calling subject's Create operations as list records (see `operation-list.ts`). */
    operationRecords(subject: string): DemoOperationRecord[] {
      const records: DemoOperationRecord[] = [];
      for (const [key, operation] of operations) {
        const [owner, operationId] = JSON.parse(key) as [string, string];
        if (owner !== subject) continue;
        const spec = operation.result ? specifications.get(operation.result.specId) : undefined;
        records.push({
          operationId,
          status: operation.status === 'completed' ? 'completed' : 'recovery-required',
          ...(spec ? { title: spec.record.title, specId: spec.record.id } : {}),
          ...(operation.result ? { slug: operation.result.slug } : {}),
          ...(operation.workspaceId ? { workspaceId: operation.workspaceId } : {}),
          ...(operation.branch ? { branch: operation.branch } : {}),
          step: operation.step,
          updatedAt: operation.updatedAt,
          newWorktree: operation.workspaceId !== liveOptions.primaryWorkspaceId,
          commits: liveOptions.commits !== undefined,
        });
      }
      return records;
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
