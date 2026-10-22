import type { HttpRequestClient } from '@nevo/http-client';
import type {
  DemoSessionInput,
  DemoSessionResult,
  DemoSessionDetail,
} from '@nevo/specflow-contracts/demo';
import type { SessionsApi } from './api';

/** Demo-runtime adapter of {@link SessionsApi}; a real adapter can sit beside it. */
export function createDemoSessionsApi(http: HttpRequestClient): SessionsApi {
  const spec = (id: string) => `/api/demo/specs/${encodeURIComponent(id)}`;
  return {
    allocate: (id, input: DemoSessionInput) =>
      http.post<DemoSessionResult>(`${spec(id)}/sessions`, input),
    session: (id, session, signal) =>
      http.get<DemoSessionDetail>(`${spec(id)}/sessions/${encodeURIComponent(session)}`, {
        signal,
      }),
  };
}
