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
      const bounded = (value: unknown, max: number) =>
        typeof value === 'string' && value.length > 0 && value.length <= max;
      if (
        !input ||
        !['read-only', 'workspace-write'].includes(input.mode) ||
        !bounded(input.requestId, 36) ||
        !/^[0-9a-f-]{36}$/i.test(input.requestId) ||
        !bounded(input.providerId, 128) ||
        (input.modelId !== undefined && !bounded(input.modelId, 256)) ||
        (input.providerModeId !== undefined && !bounded(input.providerModeId, 128)) ||
        (input.title !== undefined && !bounded(input.title, 256)) ||
        (input.effort !== undefined && !bounded(input.effort, 64)) ||
        Object.keys(input).some(
          (field) =>
            ![
              'requestId',
              'providerId',
              'modelId',
              'providerModeId',
              'title',
              'effort',
              'mode',
            ].includes(field),
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
