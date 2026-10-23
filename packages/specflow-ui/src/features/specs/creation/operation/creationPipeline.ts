import type { DemoCreatedSpec, DemoSessionResult } from '@nevo/specflow-contracts/demo';
/**
 * Thrown before a request is dispatched when the browser reports no connection. Unlike a failure
 * after dispatch, this proves the server never saw the request, so nothing can have been created.
 */
export class RequestNotSentError extends Error {
  constructor() {
    super('Request was not sent: no connection.');
    this.name = 'RequestNotSentError';
  }
}
export interface CreationProgress {
  created?: DemoCreatedSpec;
}
/**
 * Create is atomic and fixes the workspace; the only later stage is the optional initial Session.
 * Each authoritative result is committed before the next independently retryable operation.
 */
export async function continueDemoCreation(
  progress: CreationProgress,
  operations: {
    existingSpecId?: string;
    create: () => Promise<DemoCreatedSpec>;
    allocate?: (spec: string) => Promise<DemoSessionResult>;
  },
): Promise<{ specId: string; documentId?: string; sessionId?: string }> {
  if (!operations.existingSpecId && !progress.created) progress.created = await operations.create();
  const specId = operations.existingSpecId ?? progress.created!.specId;
  const session = operations.allocate ? await operations.allocate(specId) : undefined;
  return {
    specId,
    documentId: progress.created?.documentIds[0],
    ...(session ? { sessionId: session.sessionId } : {}),
  };
}
