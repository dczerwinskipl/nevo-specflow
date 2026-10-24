import { createRuntimeOperationsApi, type OperationsApi } from '../shared/operations/operationsApi';
import type { DemoCreationApi } from '../features/specs/creation/api/api.demo';
import { createDemoCreationApi } from '../features/specs/creation/api/api.demo';
import {
  createProjectCreationApi,
  type ProjectCreationApi,
} from '../features/specs/creation/api/api.project';
import { createSpecErrorCodes } from '../features/specs/creation/errors/createSpecErrors';
import { createApiTransport } from '../api';
import type { SessionsApi } from '../features/sessions/api';
import { createDemoSessionsApi } from '../features/sessions/api.demo';
import { createHttpClient, type HttpClient } from '@nevo/http-client';

import { createBrowserAuthApi, type AuthApi } from '../auth/api';
import { createRuntimeInfoApi, type RuntimeInfoApi } from './runtimeInfoApi';
import { createAuthStore, type AuthStore } from '../auth/store';
import { createAuthRecoveryCoordinator, type AuthRecoveryCoordinator } from '../auth/recovery';
import { createProtectedRuntimeHttpClient } from './createProtectedRuntimeHttpClient';
import {
  createRuntimeSpecsOverviewApi,
  type SpecsOverviewApi,
} from '../features/specs/overview/data/api';
import {
  createRuntimeSpecificationApi,
  type SpecificationApi,
} from '../features/specs/read-model/api';
import { createRuntimeTaskApi, type TaskApi } from '../features/tasks/api';
import {
  createRuntimeDocumentApi,
  type DocumentApi,
  type DocumentsApi,
} from '../features/documents/api';
import { createDemoDocumentsApi } from '../features/documents/api.demo';
import { createProjectDocumentsApi } from '../features/documents/api.project';

export interface SpecFlowAppServices {
  readonly runtimeInfoApi: RuntimeInfoApi;
  readonly authApi: AuthApi;
  readonly authStore: AuthStore;
  readonly authRecovery: AuthRecoveryCoordinator;
  readonly specsOverviewApi: SpecsOverviewApi;
  readonly specificationApi: SpecificationApi;
  readonly taskApi: TaskApi;
  readonly documentApi: DocumentApi;
  /** Document tree and writes of the demo Runtime (the Documents workspace renders in demo mode). */
  readonly documentsApi: DocumentsApi;
  /**
   * The same port in a project Runtime: the real tree read, writes unavailable until the Runtime
   * serves them. The Runtime mode selects it once the workspace renders in project mode (phase C).
   */
  readonly projectDocumentsApi: DocumentsApi;
  readonly sessionsApi: SessionsApi;
  readonly demoCreationApi: DemoCreationApi;
  /** Specification creation of a project Runtime (the demo Runtime uses `demoCreationApi`). */
  readonly projectCreationApi: ProjectCreationApi;
  /** Lists of long-running operations and their live progress (generic, best effort). */
  readonly operationsApi: OperationsApi;
}

export interface SpecFlowServicesOptions {
  readonly http?: HttpClient;
  readonly runtimeInfoApi?: RuntimeInfoApi;
  readonly authApi?: AuthApi;
  readonly authStore?: AuthStore;
  readonly authRecovery?: AuthRecoveryCoordinator;
  readonly specsOverviewApi?: SpecsOverviewApi;
  readonly specificationApi?: SpecificationApi;
  readonly taskApi?: TaskApi;
  readonly documentApi?: DocumentApi;
  readonly documentsApi?: DocumentsApi;
  readonly projectDocumentsApi?: DocumentsApi;
  readonly sessionsApi?: SessionsApi;
  readonly demoCreationApi?: DemoCreationApi;
  readonly projectCreationApi?: ProjectCreationApi;
  readonly operationsApi?: OperationsApi;
}

export function createSpecFlowAppServices(
  optionsOrClient: SpecFlowServicesOptions | HttpClient = {},
): SpecFlowAppServices {
  const options: SpecFlowServicesOptions =
    'get' in optionsOrClient && 'post' in optionsOrClient
      ? { http: optionsOrClient }
      : optionsOrClient;

  const http = options.http ?? createHttpClient();
  const authApi = options.authApi ?? createBrowserAuthApi(http);
  const authStore = options.authStore ?? createAuthStore(authApi);
  const authRecovery = options.authRecovery ?? createAuthRecoveryCoordinator(authStore);
  const runtimeHttp = createProtectedRuntimeHttpClient(http, authRecovery);

  // Specification reads: failures are classified once (ApiError), cancellation passes through.
  const specsRead = createApiTransport(runtimeHttp, { operation: 'specs.read' });
  const specsOverviewApi = options.specsOverviewApi ?? createRuntimeSpecsOverviewApi(specsRead);

  const specificationApi = options.specificationApi ?? createRuntimeSpecificationApi(specsRead);

  return {
    runtimeInfoApi: options.runtimeInfoApi ?? createRuntimeInfoApi(runtimeHttp),
    authApi,
    authStore,
    authRecovery,
    specsOverviewApi,
    specificationApi,
    taskApi: options.taskApi ?? createRuntimeTaskApi(runtimeHttp),
    documentApi: options.documentApi ?? createRuntimeDocumentApi(runtimeHttp),
    documentsApi: options.documentsApi ?? createDemoDocumentsApi(runtimeHttp),
    projectDocumentsApi:
      options.projectDocumentsApi ??
      createProjectDocumentsApi(createApiTransport(runtimeHttp, { operation: 'documents.read' })),
    sessionsApi: options.sessionsApi ?? createDemoSessionsApi(runtimeHttp),
    demoCreationApi: options.demoCreationApi ?? createDemoCreationApi(runtimeHttp),
    projectCreationApi:
      options.projectCreationApi ??
      createProjectCreationApi(
        createApiTransport(runtimeHttp, { operation: 'specs.create', codes: createSpecErrorCodes }),
      ),
    operationsApi: options.operationsApi ?? createRuntimeOperationsApi(runtimeHttp),
  };
}

export const defaultSpecFlowServices: SpecFlowAppServices = createSpecFlowAppServices();
