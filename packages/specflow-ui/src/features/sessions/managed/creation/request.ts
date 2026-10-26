import type { CreateSession } from '@nevo/specflow-contracts/sessions';
import { retainRequest, type RequestAttempt } from '../../../../shared/operations/retainedRequest';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Persist before dispatch. An uncertain create retains its exact body across route reloads. */
export function createSessionRequest(owner: string, storage: Storage | undefined) {
  const key = 'nevo:session-create:' + owner;
  const holder: { current: RequestAttempt<CreateSession> | null } = { current: null };
  let readable = true;
  try {
    const encoded = storage?.getItem(key);
    if (encoded) {
      if (encoded.length > 4096) throw new Error('Invalid retained create');
      const input = JSON.parse(encoded) as CreateSession;
      if (
        input?.mode !== 'read-only' ||
        typeof input.requestId !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(input.requestId) ||
        typeof input.providerId !== 'string' ||
        input.providerId.length > 128 ||
        (input.modelId !== undefined &&
          (typeof input.modelId !== 'string' || input.modelId.length > 256)) ||
        Object.keys(input).some(
          (field) => !['requestId', 'providerId', 'modelId', 'mode'].includes(field),
        )
      )
        throw new Error('Invalid retained create');
      const { requestId: _requestId, ...body } = input;
      holder.current = { signature: JSON.stringify(body), input };
    }
  } catch {
    readable = false;
  }
  return {
    pending: () => holder.current?.input,
    async send<R>(
      body: Omit<CreateSession, 'requestId'>,
      send: (input: CreateSession) => Promise<R>,
    ) {
      if (!storage || !readable) throw new Error('Retained create storage is unavailable.');
      // Discovery may change while a previous acknowledgement is lost. Retry the old intent.
      const input = holder.current?.input ?? retainRequest(holder, body);
      const encoded = JSON.stringify(input);
      storage.setItem(key, encoded);
      const result = await send(input);
      if (storage.getItem(key) === encoded) storage.removeItem(key);
      holder.current = null;
      return result;
    },
  };
}
