import { useMemo } from 'react';
import type { CreateSpecRequest } from '@nevo/specflow-contracts/specs';
import { useAppServices } from '../../../app/useAppServices';
import { authSessionIdentity } from '../../../auth/store';

/** The request of an operation that was sent and whose outcome is not yet confirmed. */
export type SentCreateRequest = CreateSpecRequest & { operationId: string };

export interface StoredCreateOperation {
  readonly request: SentCreateRequest;
  /** Epoch ms of the first attempt; bounds how long a reloaded page keeps watching. */
  readonly startedAt: number;
}

export interface CreateOperationStorage {
  load(): StoredCreateOperation | undefined;
  save(operation: StoredCreateOperation): void;
  clear(): void;
}

const keyPrefix = 'specflow.create.operation.v1:';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isStored(value: unknown): value is StoredCreateOperation {
  if (typeof value !== 'object' || value === null) return false;
  const { request, startedAt } = value as Partial<StoredCreateOperation>;
  return (
    typeof startedAt === 'number' &&
    typeof request === 'object' &&
    request !== null &&
    typeof request.operationId === 'string' &&
    typeof request.title === 'string'
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
  };
}

function browserSessionStorage(): StorageLike | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

/** Storage of the current identity (one entry per signed-in principal). */
export function useCreateOperationStorage(): CreateOperationStorage {
  const { authStore } = useAppServices();
  const state = authStore.getState();
  const identity = state.status === 'ready' ? authSessionIdentity(state.session) : 'unknown';
  return useMemo(
    () => createSessionOperationStorage(identity, browserSessionStorage()),
    [identity],
  );
}
