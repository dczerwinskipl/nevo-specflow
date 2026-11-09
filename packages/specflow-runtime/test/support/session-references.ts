import type { SessionReference, SessionReferenceOwner } from '../../src/features/sessions';

/** A Session reference owner over one resolve function; `resolveMany` is its batch form. */
export function sessionReferences(
  resolve: (sessionId: string) => Promise<SessionReference | null>,
  onBatch?: (sessionIds: readonly string[]) => void,
): SessionReferenceOwner {
  return {
    resolve,
    async resolveMany(sessionIds) {
      onBatch?.(sessionIds);
      const resolved = new Map<string, SessionReference>();
      for (const sessionId of sessionIds) {
        const reference = await resolve(sessionId);
        if (reference) {
          resolved.set(sessionId, reference);
        }
      }

      return resolved;
    },
  };
}
