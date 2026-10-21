import type {
  DemoSessionInput,
  DemoSessionResult,
  DemoSessionDetail,
} from '@nevo/specflow-contracts/demo';

/** Port of Session allocation and detail. */
export interface SessionsApi {
  allocate(specId: string, input: DemoSessionInput): Promise<DemoSessionResult>;
  session(specId: string, sessionId: string, signal?: AbortSignal): Promise<DemoSessionDetail>;
}
