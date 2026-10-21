import type { SpecFlowEngine } from '../application';
import {
  inspectRegisteredWorkspace,
  type RegisteredWorkspaceInspection,
  type WorkspaceRegistry,
} from '../project/workspace-registry';
import { READ_GIT_CONCURRENCY, mapBounded } from '../concurrency';
import { isValidSpecificationId, SpecificationError } from './model';
import { listWorkspaceSpecifications, type WorkspaceSpecification } from './repository';

/**
 * The workstation-local registry selects WHERE a spec is authoritative.
 * The selected checkout's specification.yaml selects WHAT it contains.
 * No generated index, unregistered worktree or stale primary copy is a fallback.
 */
export type DiscoveredSpecification =
  | {
      readonly status: 'available';
      readonly specId: string;
      readonly workspaceId: string;
      readonly workspaceRoot: string;
      readonly binding: 'explicit' | 'primary-default';
      readonly specification: WorkspaceSpecification;
    }
  | {
      readonly status: 'workspace_unavailable';
      readonly specId: string;
      readonly workspaceId: string;
      readonly binding: 'explicit';
      readonly reason: string;
    }
  | {
      readonly status: 'manifest_missing';
      readonly specId: string;
      readonly workspaceId: string;
      readonly workspaceRoot: string;
      readonly binding: 'explicit';
    };

/**
 * Read-only discovery of one canonical row per specId. Only registered and
 * verified roots may be queried, and linked roots are queried only if an
 * explicit binding makes them authoritative for at least one spec.
 */
export async function discoverSpecifications(
  engine: SpecFlowEngine,
  isIncluded?: (specId: string) => boolean,
): Promise<readonly DiscoveredSpecification[]> {
  return discoverWithAdmission(engine, isIncluded);
}

/**
 * Create-only admission scan. Caller must hold the Project Home lock and
 * supply only paths/slugs from validated journals in manifest-writing stage.
 * Ordinary reads never hide incomplete or malformed manifests.
 */
export async function discoverSpecificationsForCreateAdmission(
  engine: SpecFlowEngine,
  writingSlugsByWorkspace: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<readonly DiscoveredSpecification[]> {
  return discoverWithAdmission(engine, undefined, writingSlugsByWorkspace);
}

async function discoverWithAdmission(
  engine: SpecFlowEngine,
  isIncluded?: (specId: string) => boolean,
  writingSlugsByWorkspace?: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<readonly DiscoveredSpecification[]> {
  const registry = await engine.readRegistry();
  const primary = await inspectRegisteredWorkspace(
    engine.context,
    registry,
    registry.primaryWorkspaceId,
  );
  if (primary.status !== 'available') {
    throw new SpecificationError(
      'SPEC_SOURCE_INVALID',
      'The authoritative primary Project Home checkout is unavailable.',
    );
  }

  const primarySpecifications = await listWorkspaceSpecifications(
    primary.root,
    writingSlugsByWorkspace?.get(primary.root),
  );
  const explicitlyBound = new Map(
    registry.specBindings.map((binding) => [binding.specId, binding]),
  );
  const found = new Map<string, DiscoveredSpecification>();

  // Primary is the documented default for unbound specifications, but an
  // explicit binding to linked ALWAYS wins, even if that source is missing.
  for (const specification of primarySpecifications) {
    const binding = explicitlyBound.get(specification.specId);
    if (binding && binding.workspaceId !== registry.primaryWorkspaceId) continue;
    found.set(specification.specId, {
      status: 'available',
      specId: specification.specId,
      workspaceId: registry.primaryWorkspaceId,
      workspaceRoot: primary.root,
      binding: binding ? 'explicit' : 'primary-default',
      specification,
    });
  }

  const manifests = new Map<string, readonly WorkspaceSpecification[]>([
    [registry.primaryWorkspaceId, primarySpecifications],
  ]);

  // Linked workspaces are independent: inspect and list them concurrently, then
  // consume the outcomes in binding order below. A failure is rethrown only when
  // the sequential walk reaches it, so error precedence is unchanged.
  const linkedIds: string[] = [];
  for (const binding of registry.specBindings) {
    if (!isValidSpecificationId(binding.specId)) break;
    if (isIncluded && !isIncluded(binding.specId)) continue;
    if (binding.workspaceId === registry.primaryWorkspaceId) continue;
    if (!linkedIds.includes(binding.workspaceId)) linkedIds.push(binding.workspaceId);
  }
  const prefetched = new Map<string, LinkedOutcome>();
  const settled = await mapBounded(linkedIds, READ_GIT_CONCURRENCY, async (workspaceId) => {
    try {
      const inspection = await inspectRegisteredWorkspace(engine.context, registry, workspaceId);
      const listed =
        inspection.status === 'available'
          ? await listWorkspaceSpecifications(
              inspection.root,
              writingSlugsByWorkspace?.get(inspection.root),
            )
          : undefined;
      return { inspection, listed } satisfies LinkedOutcome;
    } catch (error) {
      return { error } satisfies LinkedOutcome;
    }
  });
  linkedIds.forEach((id, index) => prefetched.set(id, settled[index]!));

  const inspected = new Map<string, RegisteredWorkspaceInspection>([
    [registry.primaryWorkspaceId, primary],
  ]);

  for (const binding of registry.specBindings) {
    if (!isValidSpecificationId(binding.specId)) {
      throw new SpecificationError(
        'SPEC_CONFLICT',
        'Registry binding refers to an invalid canonical specification identity.',
      );
    }

    // An excluded explicit binding cannot make an authorized, unrelated spec unavailable.
    // The primary checkout is still scanned globally: unbound IDs have no separate index.
    if (isIncluded && !isIncluded(binding.specId)) continue;

    let inspection = inspected.get(binding.workspaceId);
    if (!inspection) {
      const outcome = prefetched.get(binding.workspaceId)!;
      if ('error' in outcome) throw outcome.error;
      inspection = outcome.inspection;
      inspected.set(binding.workspaceId, inspection);
      if (outcome.listed) manifests.set(binding.workspaceId, outcome.listed);
    }
    if (inspection.status === 'unavailable') {
      found.set(binding.specId, {
        status: 'workspace_unavailable',
        specId: binding.specId,
        workspaceId: binding.workspaceId,
        binding: 'explicit',
        reason: inspection.reason,
      });
      continue;
    }

    let specifications = manifests.get(binding.workspaceId);
    if (!specifications) {
      specifications = await listWorkspaceSpecifications(
        inspection.root,
        writingSlugsByWorkspace?.get(inspection.root),
      );
      manifests.set(binding.workspaceId, specifications);
    }
    const specification = specifications.find((item) => item.specId === binding.specId);
    found.set(
      binding.specId,
      specification
        ? {
            status: 'available',
            specId: binding.specId,
            workspaceId: binding.workspaceId,
            workspaceRoot: inspection.root,
            binding: 'explicit',
            specification,
          }
        : {
            status: 'manifest_missing',
            specId: binding.specId,
            workspaceId: binding.workspaceId,
            workspaceRoot: inspection.root,
            binding: 'explicit',
          },
    );
  }

  assertCanonicalSlugs(found);
  await ensureBindingRevisionUnchanged(engine, registry);
  return [...found.values()]
    .filter((item) => !isIncluded || isIncluded(item.specId))
    .sort((left, right) => left.specId.localeCompare(right.specId));
}

/**
 * A missing unbound ID is genuinely absent; missing bound sources are distinct
 * read-model states, not SPEC_NOT_FOUND and never a stale-primary fallback.
 */
export async function resolveSpecification(
  engine: SpecFlowEngine,
  specId: string,
): Promise<DiscoveredSpecification> {
  if (!isValidSpecificationId(specId)) {
    throw new SpecificationError('SPEC_VALIDATION_ERROR', 'Invalid specification identity.');
  }
  // Resolve only this identity. Other linked bindings cannot block a scoped read.
  // Primary manifest corruption remains a project-level integrity error.
  const items = await discoverSpecifications(engine, (candidate) => candidate === specId);
  const selected = items.find((item) => item.specId === specId);
  if (!selected) {
    throw new SpecificationError('SPEC_NOT_FOUND', 'Specification does not exist in this project.');
  }
  return selected;
}

function assertCanonicalSlugs(found: ReadonlyMap<string, DiscoveredSpecification>): void {
  const owners = new Map<string, string>();
  for (const item of found.values()) {
    if (item.status !== 'available') continue;
    const slug = item.specification.slug.toLowerCase();
    const existingId = owners.get(slug);
    if (existingId !== undefined && existingId !== item.specId) {
      throw new SpecificationError(
        'SPEC_CONFLICT',
        'Different canonical specifications have the same slug in registered workspaces.',
      );
    }
    owners.set(slug, item.specId);
  }
}

async function ensureBindingRevisionUnchanged(
  engine: SpecFlowEngine,
  initial: WorkspaceRegistry,
): Promise<void> {
  // If a writer changed binding precedence during the filesystem scan, don't
  // return a row based on an obsolete authority selection.
  const latest = await engine.readRegistry();
  if (latest.revision !== initial.revision) {
    throw new SpecificationError(
      'SPEC_CONFLICT',
      'Workspace registry changed during discovery. Re-read before using the result.',
    );
  }
}

type LinkedOutcome =
  | {
      readonly inspection: RegisteredWorkspaceInspection;
      readonly listed: readonly WorkspaceSpecification[] | undefined;
    }
  | { readonly error: unknown };
