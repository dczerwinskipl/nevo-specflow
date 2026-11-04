import type { CreateSession } from '@nevo/specflow-contracts/sessions';
import { writeOutcomeUnknown } from '../../../../shared/http/apiErrorCode';
import { retainRequest, type RequestAttempt } from '../../../../shared/operations/retainedRequest';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * What the retained create record is, as far as it could be read:
 * - `ready`: no record, or a valid one (held in `pending`);
 * - `unreadable`: a record exists but is malformed. It may hold a create whose acknowledgement was
 *   lost, so it is never overwritten silently: only an explicit `discard()` removes it;
 * - `unavailable`: the storage itself cannot be used (absent, or it throws): blocks, as it cannot
 *   keep a request either.
 */
export type RetainedCreateState = 'ready' | 'unreadable' | 'unavailable';

function parseRetained(encoded: string): CreateSession | undefined {
  if (encoded.length > 4096) {
    return undefined;
  }

  let input: CreateSession;
  try {
    input = JSON.parse(encoded) as CreateSession;
  } catch {
    return undefined;
  }

  const bounded = (value: unknown, max: number) =>
    typeof value === 'string' && value.length > 0 && value.length <= max;
  const valid =
    !!input &&
    typeof input === 'object' &&
    ['read-only', 'workspace-write'].includes(input.mode) &&
    bounded(input.requestId, 36) &&
    /^[0-9a-f-]{36}$/i.test(input.requestId) &&
    bounded(input.providerId, 128) &&
    (input.modelId === undefined || bounded(input.modelId, 256)) &&
    (input.providerModeId === undefined || bounded(input.providerModeId, 128)) &&
    (input.title === undefined || bounded(input.title, 256)) &&
    (input.effort === undefined || bounded(input.effort, 64)) &&
    Object.keys(input).every((field) =>
      ['requestId', 'providerId', 'modelId', 'providerModeId', 'title', 'effort', 'mode'].includes(
        field,
      ),
    );

  return valid ? input : undefined;
}

/** Persist before dispatch. An uncertain create retains its exact body across route reloads. */
export function createSessionRequest(owner: string, storage: Storage | undefined) {
  const key = 'nevo:session-create:' + owner;
  const holder: { current: RequestAttempt<CreateSession> | null } = { current: null };
  let state: RetainedCreateState = storage ? 'ready' : 'unavailable';
  try {
    const encoded = storage?.getItem(key);
    if (encoded) {
      const input = parseRetained(encoded);
      if (input) {
        const { requestId: _requestId, ...body } = input;
        holder.current = { signature: JSON.stringify(body), input };
      } else {
        state = 'unreadable';
      }
    }
  } catch {
    state = 'unavailable';
  }

  /** Removes the record only when it is still this one; reports whether it is really gone. */
  function release(encoded?: string): boolean {
    try {
      if (storage && (encoded === undefined || storage.getItem(key) === encoded)) {
        storage.removeItem(key);
      }

      if (storage?.getItem(key) !== null) {
        return false;
      }
    } catch {
      return false;
    }

    holder.current = null;

    return true;
  }

  return {
    pending: () => holder.current?.input,
    state: () => state,
    /**
     * The explicit way out of an `unreadable` record (the user chose to drop a request that may
     * already have been applied). Resolves whether the record is gone and a new create may start.
     */
    discard(): boolean {
      if (state !== 'unreadable' || !release()) {
        return false;
      }

      state = 'ready';

      return true;
    },
    async send<R>(
      body: Omit<CreateSession, 'requestId'>,
      send: (input: CreateSession) => Promise<R>,
    ) {
      if (!storage || state !== 'ready') {
        throw new Error('Retained create storage is unavailable.');
      }

      // Discovery may change while a previous acknowledgement is lost. Retry the old intent.
      let input = holder.current?.input;
      const encoded = input ? JSON.stringify(input) : undefined;
      if (!input) {
        const candidate: { current: RequestAttempt<CreateSession> | null } = { current: null };
        input = retainRequest(candidate, body);
      }

      const record = encoded ?? JSON.stringify(input);
      // Write, read back, and only then hold it: a request that could not be kept is not sent.
      storage.setItem(key, record);
      if (storage.getItem(key) !== record) {
        throw new Error('Retained create could not be confirmed.');
      }

      if (!holder.current) {
        const { requestId: _requestId, ...kept } = input;
        holder.current = { signature: JSON.stringify(kept), input };
      }

      let result: R;
      try {
        result = await send(input);
      } catch (error) {
        // A definite refusal (the server saw it and said no) can never succeed on replay: release
        // it so the form edits and resends. An unknown outcome keeps the exact request.
        if (!writeOutcomeUnknown(error)) {
          release(record);
        }

        throw error;
      }

      // Confirmed: the exact record goes; whatever else is stored stays for its own owner.
      release(record);
      holder.current = null;

      return result;
    },
  };
}
