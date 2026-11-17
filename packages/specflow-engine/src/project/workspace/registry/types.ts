export const WORKSPACE_REGISTRY_RELATIVE_PATH = 'workspaces.json';
export const WORKSPACE_REGISTRY_VERSION = 1;

export type WorkspaceRegistryErrorCode =
  | 'REGISTRY_NOT_FOUND'
  | 'REGISTRY_RECOVERY_REQUIRED'
  | 'REGISTRY_CORRUPT'
  | 'REGISTRY_UNSUPPORTED_VERSION'
  | 'REGISTRY_PROJECT_MISMATCH'
  | 'REGISTRY_CONFLICT'
  | 'REGISTRY_WORKSPACE_UNAVAILABLE'
  | 'REGISTRY_WORKSPACE_MISMATCH';

export class WorkspaceRegistryError extends Error {
  readonly code: WorkspaceRegistryErrorCode;

  constructor(code: WorkspaceRegistryErrorCode, message: string) {
    super(message);
    this.name = 'WorkspaceRegistryError';
    this.code = code;
  }
}

/** Pinned destination is owned by the source workspace, not by its Specs. */
export interface WorkspaceIntegrationDestination {
  readonly workspaceId: string;
  readonly branch: string;
  readonly instanceId?: string;
}

/** Primary has no separate incarnation marker and is never managed. */
export type WorkspaceRegistration =
  | {
      readonly kind: 'primary';
      readonly workspaceId: string;
      readonly root: string;
      readonly managed: false;
      readonly instanceId?: never;
    }
  | {
      readonly kind: 'linked';
      readonly workspaceId: string;
      readonly root: string;
      readonly managed: boolean;
      /** Physical checkout incarnation required for every linked workspace. */
      readonly instanceId: string;
      /** Absent on legacy/default-target workspaces. */
      readonly integrationDestination?: WorkspaceIntegrationDestination;
      /**
       * The local branch Create based this workspace's new branch on (the explicit local-branch base
       * ref, or the branch Project Home's HEAD was attached to). Absent when the base was a commit,
       * a tag or a detached HEAD, and on workspaces created before it was recorded. A fact, never a
       * merge destination.
       */
      readonly startedFrom?: string;
      /**
       * The branch Create made for this workspace (a fact of its creation; the checkout may be on
       * another branch or detached now). Absent on workspaces created before it was recorded.
       */
      readonly branch?: string;
    };

export interface SpecWorkspaceBinding {
  readonly specId: string;
  readonly workspaceId: string;
  /** Registry revision at which this binding was last changed. */
  readonly generation: number;
}

export interface WorkspaceRegistry {
  readonly version: 1;
  readonly projectId: string;
  /** Monotonically increasing CAS revision, advanced under the project control lock. */
  readonly revision: number;
  readonly primaryWorkspaceId: string;
  readonly workspaces: readonly WorkspaceRegistration[];
  readonly specBindings: readonly SpecWorkspaceBinding[];
}

export type RegisteredWorkspaceInspection =
  | {
      readonly status: 'available';
      readonly workspace: WorkspaceRegistration;
      readonly root: string;
    }
  | {
      readonly status: 'unavailable';
      readonly workspace: WorkspaceRegistration;
      readonly reason: string;
    };
