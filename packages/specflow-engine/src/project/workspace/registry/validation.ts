import { isAbsolute, resolve } from 'node:path';

import type { ResolvedProjectHome } from '../../home/home';
import {
  WORKSPACE_REGISTRY_VERSION,
  WorkspaceRegistryError,
  type SpecWorkspaceBinding,
  type WorkspaceRegistration,
  type WorkspaceRegistry,
  type WorkspaceIntegrationDestination,
} from './types';

/** Pure schema and identity validation; never touches Git or the filesystem. */
export function validateWorkspaceRegistry(
  source: unknown,
  context: ResolvedProjectHome,
): WorkspaceRegistry {
  if (!isObject(source)) {
    throw corrupt('Registry root must be an object.');
  }

  if (source.version !== WORKSPACE_REGISTRY_VERSION) {
    throw new WorkspaceRegistryError(
      'REGISTRY_UNSUPPORTED_VERSION',
      'Unsupported workspace registry version. Explicit migration is required.',
    );
  }

  if (typeof source.projectId !== 'string' || source.projectId !== context.project.projectId) {
    throw new WorkspaceRegistryError(
      'REGISTRY_PROJECT_MISMATCH',
      'Registry project identity differs from the verified Project Home.',
    );
  }

  if (
    !Number.isSafeInteger(source.revision) ||
    (source.revision as number) < 0 ||
    !isIdentifier(source.primaryWorkspaceId) ||
    !Array.isArray(source.workspaces) ||
    !Array.isArray(source.specBindings)
  ) {
    throw corrupt('Invalid registry revision, primary identity or collections.');
  }

  const workspaces = parseRegistrations(source.workspaces);
  assertPrimaryRegistration(workspaces, source.primaryWorkspaceId, context.project.homeRoot);
  assertIntegrationDestinations(workspaces);
  const specBindings = parseBindings(
    source.specBindings,
    new Set(workspaces.map((workspace) => workspace.workspaceId)),
    source.revision as number,
  );

  return {
    version: WORKSPACE_REGISTRY_VERSION,
    projectId: source.projectId,
    revision: source.revision as number,
    primaryWorkspaceId: source.primaryWorkspaceId,
    workspaces,
    specBindings,
  };
}

function parseRegistrations(values: unknown[]): WorkspaceRegistration[] {
  const workspaces: WorkspaceRegistration[] = [];
  const workspaceIds = new Set<string>();
  const paths = new Set<string>();
  for (const value of values) {
    const workspace = parseRegistration(value);
    if (workspaceIds.has(workspace.workspaceId) || paths.has(pathKey(workspace.root))) {
      throw corrupt('Duplicate workspace identity or root.');
    }

    workspaceIds.add(workspace.workspaceId);
    paths.add(pathKey(workspace.root));
    workspaces.push(workspace);
  }

  return workspaces;
}

function parseRegistration(value: unknown): WorkspaceRegistration {
  if (
    !isObject(value) ||
    !isIdentifier(value.workspaceId) ||
    (value.kind !== 'primary' && value.kind !== 'linked') ||
    typeof value.root !== 'string' ||
    !isAbsolute(value.root) ||
    resolve(value.root) !== value.root ||
    typeof value.managed !== 'boolean' ||
    (value.kind === 'linked' && !isIdentifier(value.instanceId)) ||
    (value.kind === 'primary' && (value.managed !== false || value.instanceId !== undefined))
  ) {
    throw corrupt('Invalid workspace registration.');
  }

  if (value.kind === 'linked') {
    return {
      kind: 'linked',
      workspaceId: value.workspaceId,
      root: value.root,
      managed: value.managed,
      instanceId: value.instanceId as string,
      ...(value.integrationDestination !== undefined
        ? { integrationDestination: parseIntegrationDestination(value.integrationDestination) }
        : {}),
    };
  }

  return {
    kind: 'primary',
    workspaceId: value.workspaceId,
    root: value.root,
    managed: false,
  };
}

function parseIntegrationDestination(value: unknown): WorkspaceIntegrationDestination {
  if (
    !isObject(value) ||
    !isIdentifier(value.workspaceId) ||
    typeof value.branch !== 'string' ||
    value.branch.length === 0 ||
    value.branch.length > 255 ||
    value.branch.startsWith('/') ||
    value.branch.endsWith('/') ||
    value.branch.includes('..') ||
    /[\s\\~^:?*[\]]/u.test(value.branch) ||
    (value.instanceId !== undefined && !isIdentifier(value.instanceId)) ||
    Object.keys(value).some(
      (key) => key !== 'workspaceId' && key !== 'branch' && key !== 'instanceId',
    )
  ) {
    throw corrupt('Invalid workspace integration destination.');
  }

  return {
    workspaceId: value.workspaceId,
    branch: value.branch,
    ...(value.instanceId !== undefined ? { instanceId: value.instanceId } : {}),
  };
}

/** No cycles or dangling targets; a linked destination must pin its incarnation. */
function assertIntegrationDestinations(workspaces: readonly WorkspaceRegistration[]): void {
  const byId = new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace]));
  for (const workspace of workspaces) {
    if (workspace.kind !== 'linked' || !workspace.integrationDestination) {
      continue;
    }

    const destination = workspace.integrationDestination;
    const target = byId.get(destination.workspaceId);
    if (
      !target ||
      target.workspaceId === workspace.workspaceId ||
      target.instanceId !== destination.instanceId
    ) {
      throw corrupt('Integration destination does not match a registered checkout incarnation.');
    }

    const visited = new Set([workspace.workspaceId]);
    let cursor: WorkspaceRegistration | undefined = target;
    while (cursor) {
      if (visited.has(cursor.workspaceId)) {
        throw corrupt('Cyclic integration destinations.');
      }

      visited.add(cursor.workspaceId);
      cursor =
        cursor.kind === 'linked' && cursor.integrationDestination
          ? byId.get(cursor.integrationDestination.workspaceId)
          : undefined;
    }
  }
}

function assertPrimaryRegistration(
  workspaces: readonly WorkspaceRegistration[],
  primaryWorkspaceId: string,
  homeRoot: string,
): void {
  const primary = workspaces.filter((workspace) => workspace.kind === 'primary');
  if (
    primary.length !== 1 ||
    primary[0]?.workspaceId !== primaryWorkspaceId ||
    primary[0]?.root !== homeRoot ||
    primary[0]?.managed
  ) {
    throw corrupt('Exactly one unmanaged primary workspace must identify Project Home.');
  }
}

function parseBindings(
  values: unknown[],
  workspaceIds: ReadonlySet<string>,
  revision: number,
): SpecWorkspaceBinding[] {
  const specIds = new Set<string>();
  const bindings: SpecWorkspaceBinding[] = [];
  for (const value of values) {
    if (
      !isObject(value) ||
      !isIdentifier(value.specId) ||
      !isIdentifier(value.workspaceId) ||
      !workspaceIds.has(value.workspaceId) ||
      !Number.isSafeInteger(value.generation) ||
      (value.generation as number) < 0 ||
      (value.generation as number) > revision
    ) {
      throw corrupt('Invalid specification binding or unknown workspace identity.');
    }

    if (specIds.has(value.specId)) {
      throw corrupt('Duplicate specification identity.');
    }

    specIds.add(value.specId);
    bindings.push({
      specId: value.specId,
      workspaceId: value.workspaceId,
      generation: value.generation as number,
    });
  }

  return bindings;
}

export function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function pathKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

export function corrupt(message: string): WorkspaceRegistryError {
  return new WorkspaceRegistryError('REGISTRY_CORRUPT', message);
}
