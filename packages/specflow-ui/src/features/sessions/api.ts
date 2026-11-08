import type {
  DemoSessionInput,
  DemoSessionResult,
  DemoSessionDetail,
} from '@nevo/specflow-contracts/demo';

/** Port of Session allocation and detail. */
export interface SessionsApi {
  /** Starts a demo Session; `path` is the workspace's `startSession.path` when it is known. */
  allocate(specId: string, input: DemoSessionInput, path?: string): Promise<DemoSessionResult>;
  session(specId: string, sessionId: string, signal?: AbortSignal): Promise<DemoSessionDetail>;
}
