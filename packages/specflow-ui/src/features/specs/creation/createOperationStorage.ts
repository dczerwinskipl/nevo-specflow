import { useState } from 'react';
import { isCreateSpecRequest, type CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import { useAppServices } from '../../../app/useAppServices';
import { authSessionIdentity } from '../../../auth/store';
import type { CreateFailure } from './createFailure';
import { initialWorkspaceChoice, type WorkspaceChoice } from './workspace/workspaceChoice';

/** The request of an operation that was sent and whose outcome is not yet confirmed. */
export type SentCreateRequest = CreateSpecRequest & { operationId: string };

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
  readonly title: string;
  readonly goal: string;
  readonly choice: WorkspaceChoice;
  readonly failure?: CreateFailure;
}

export interface CreateOperationStorage {
  load(): StoredCreateOperation | undefined;
  save(operation: StoredCreateOperation): void;
  clear(): void;
  loadDraft(): CreateDraft | undefined;
  saveDraft(draft: CreateDraft): void;
  clearDraft(): void;
}

const keyPrefix = 'specflow.create.operation.v1:';
const draftKeyPrefix = 'specflow.create.draft.v1:';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A draft only seeds form fields, so a damaged one is dropped; the choice is merged onto defaults. */
function toDraft(value: unknown): CreateDraft | undefined {
  if (!isRecord(value) || typeof value.title !== 'string' || typeof value.goal !== 'string')
    return undefined;
  if (!isRecord(value.choice)) return undefined;
  const failure =
    isRecord(value.failure) && typeof value.failure.kind === 'string'
      ? (value.failure as unknown as CreateFailure)
      : undefined;
  return {
    title: value.title,
    goal: value.goal,
    choice: { ...initialWorkspaceChoice, ...(value.choice as Partial<WorkspaceChoice>) },
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
  return (
    typeof startedAt === 'number' &&
    isCreateSpecRequest(request) &&
    typeof request.operationId === 'string'
  );
}

/**
 * Keeps the unconfirmed Create operation in `sessionStorage`, keyed by the signed-in identity, so a
 * reload (or an accidental close of the tab) resumes watching the same operation instead of
 * forgetting it and risking a second branch. It survives only until the tab closes by design.
 * Storage may be unavailable or full: persistence is then silently skipped.
 */
export function createSessionOperationStorage(
  identity: string,
  storage: StorageLike | undefined,
): CreateOperationStorage {
  const key = `${keyPrefix}${identity}`;
  const draftKey = `${draftKeyPrefix}${identity}`;
  return {
    load() {
      try {
        const raw = storage?.getItem(key);
        if (!raw) return undefined;
        const parsed: unknown = JSON.parse(raw);
        if (isStored(parsed)) return parsed;
        storage?.removeItem(key);
      } catch {
        // Unreadable entry: treated as absent.
      }
      return undefined;
    },
    save(operation) {
      try {
        storage?.setItem(key, JSON.stringify(operation));
      } catch {
        // Persistence is best effort.
      }
    },
    clear() {
      try {
        storage?.removeItem(key);
      } catch {
        // Persistence is best effort.
      }
    },
    loadDraft() {
      try {
        const raw = storage?.getItem(draftKey);
        if (!raw) return undefined;
        const draft = toDraft(JSON.parse(raw));
        if (!draft) storage?.removeItem(draftKey);
        return draft;
      } catch {
        return undefined;
      }
    },
    saveDraft(draft) {
      try {
        storage?.setItem(draftKey, JSON.stringify(draft));
      } catch {
        // Persistence is best effort.
      }
    },
    clearDraft() {
      try {
        storage?.removeItem(draftKey);
      } catch {
        // Persistence is best effort.
      }
    },
  };
}

function browserSessionStorage(): StorageLike | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * Storage of the signed-in identity at the moment the Create form opens. The key is captured once:
 * saving, resuming and releasing an operation must all address the same entry even if the session
 * is briefly not `ready` (refresh, recovery) while the operation runs.
 */
export function useCreateOperationStorage(): CreateOperationStorage {
  const { authStore } = useAppServices();
  const [storage] = useState(() => {
    const state = authStore.getState();
    const identity = state.status === 'ready' ? authSessionIdentity(state.session) : 'unknown';
    return createSessionOperationStorage(identity, browserSessionStorage());
  });
  return storage;
}
