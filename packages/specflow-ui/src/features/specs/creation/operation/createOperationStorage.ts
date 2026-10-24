import { useState } from 'react';
import { isCreateSpecRequest } from '@nevo/specflow-contracts/specs';
import type { ProjectCreateRequest } from '../api/api.project';
import { useAppServices } from '../../../../app/useAppServices';
import { authSessionIdentity, type AuthStore } from '../../../../auth/store';
import type { CreateFailure } from '../errors/createFailure';
import { toCreateFacts, type CreateSettingsFacts } from '../workspace/model/createFacts';
import { initialWorkspaceChoice, type WorkspaceChoice } from '../workspace/model/workspaceChoice';

/** The request of an operation that was sent and whose outcome is not yet confirmed. */
export type SentCreateRequest = ProjectCreateRequest & { operationId: string };

export interface StoredCreateOperation {
  readonly request: SentCreateRequest;
  /** Epoch ms of the first attempt; bounds how long a reloaded page keeps watching. */
  readonly startedAt: number;
}

/**
 * What the owner entered into the Create form, kept while the progress page runs the operation so
 * "Back to form" returns to the same values. It is the form's own state, never the request that
 * was sent, and it is not in the URL. `failure` is the refusal the form should flag at its field.
 */
export interface CreateDraft {
  /** The operation this draft was submitted as: it is stored, and shown, only under that id. */
  readonly operationId: string;
  readonly title: string;
  readonly goal: string;
  readonly choice: WorkspaceChoice;
  /** What the form said this Create does (workspace names, branches, folder); display only. */
  readonly facts?: CreateSettingsFacts;
  readonly failure?: CreateFailure;
}

/**
 * The ledger of this tab, one entry (and one draft) per operation id: a second operation never
 * overwrites the first one's resume ability. Entries are only ever read by id, never "the latest".
 */
export interface CreateOperationStorage {
  load(operationId: string): StoredCreateOperation | undefined;
  save(operation: StoredCreateOperation): void;
  clear(operationId: string): void;
  loadDraft(operationId: string): CreateDraft | undefined;
  saveDraft(draft: CreateDraft): void;
  clearDraft(operationId: string): void;
}

const keyPrefix = 'specflow.create.operation.v1:';
const draftKeyPrefix = 'specflow.create.draft.v1:';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A draft only seeds form fields, so a damaged one is dropped; the choice is merged onto defaults. */
function toDraft(value: unknown): CreateDraft | undefined {
  if (
    !isRecord(value) ||
    typeof value.operationId !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.goal !== 'string'
  )
    return undefined;
  if (!isRecord(value.choice)) return undefined;
  const failure =
    isRecord(value.failure) && typeof value.failure.kind === 'string'
      ? (value.failure as unknown as CreateFailure)
      : undefined;
  const facts = toCreateFacts(value.facts);
  return {
    operationId: value.operationId,
    title: value.title,
    goal: value.goal,
    choice: { ...initialWorkspaceChoice, ...(value.choice as Partial<WorkspaceChoice>) },
    ...(facts ? { facts } : {}),
    ...(failure ? { failure } : {}),
  };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The stored request is POSTed again on resume, so it is validated like any request: a tampered or
 * outdated entry (for example a malformed target) is dropped, never sent.
 */
function isStored(value: unknown): value is StoredCreateOperation {
  if (typeof value !== 'object' || value === null) return false;
  const { request, startedAt } = value as Partial<StoredCreateOperation>;
  // The contract request schema also requires the archetype selection, which the project form does
  // not send yet (see `ProjectCreateRequest`): probe the stored request with a placeholder selection.
  const probe = {
    ...(request as object | undefined),
    archetypeId: 'placeholder',
    archetypeVersion: 1,
    catalogueRevision: 'placeholder',
  };
  return (
    typeof startedAt === 'number' &&
    isCreateSpecRequest(probe) &&
    typeof probe.operationId === 'string'
  );
}

/**
 * Keeps the unconfirmed Create operation in `sessionStorage`, keyed by the signed-in identity and
 * the operation id, so a reload (or an accidental close of the tab) resumes watching the same operation instead of
 * forgetting it and risking a second branch. It survives only until the tab closes by design.
 * Storage may be unavailable or full: persistence is then silently skipped.
 */
export function createSessionOperationStorage(
  identity: string,
  storage: StorageLike | undefined,
): CreateOperationStorage {
  const key = (operationId: string) => `${keyPrefix}${identity}:${operationId}`;
  const draftKey = (operationId: string) => `${draftKeyPrefix}${identity}:${operationId}`;
  const remove = (name: string) => {
    try {
      storage?.removeItem(name);
    } catch {
      // Persistence is best effort.
    }
  };
  return {
    load(operationId) {
      try {
        const raw = storage?.getItem(key(operationId));
        if (!raw) return undefined;
        const parsed: unknown = JSON.parse(raw);
        if (isStored(parsed) && parsed.request.operationId === operationId) return parsed;
        remove(key(operationId));
      } catch {
        // Unreadable entry: treated as absent.
      }
      return undefined;
    },
    save(operation) {
      try {
        storage?.setItem(key(operation.request.operationId), JSON.stringify(operation));
      } catch {
        // Persistence is best effort.
      }
    },
    clear: (operationId) => remove(key(operationId)),
    loadDraft(operationId) {
      try {
        const raw = storage?.getItem(draftKey(operationId));
        if (!raw) return undefined;
        const draft = toDraft(JSON.parse(raw));
        if (draft?.operationId === operationId) return draft;
        remove(draftKey(operationId));
      } catch {
        // Unreadable draft: treated as absent.
      }
      return undefined;
    },
    saveDraft(draft) {
      try {
        storage?.setItem(draftKey(draft.operationId), JSON.stringify(draft));
      } catch {
        // Persistence is best effort.
      }
    },
    clearDraft: (operationId) => remove(draftKey(operationId)),
  };
}

function browserSessionStorage(): StorageLike | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

/** The Create ledger of the signed-in identity (or of an unknown one) in this tab's session storage. */
export function createOperationStorageFor(authStore: AuthStore): CreateOperationStorage {
  const state = authStore.getState();
  const identity = state.status === 'ready' ? authSessionIdentity(state.session) : 'unknown';
  return createSessionOperationStorage(identity, browserSessionStorage());
}

/**
 * Storage of the signed-in identity at the moment the Create form opens. The key is captured once:
 * saving, resuming and releasing an operation must all address the same entry even if the session
 * is briefly not ready (refresh, recovery) while the operation runs.
 */
export function useCreateOperationStorage(): CreateOperationStorage {
  const { authStore } = useAppServices();
  const [storage] = useState(() => createOperationStorageFor(authStore));
  return storage;
}
