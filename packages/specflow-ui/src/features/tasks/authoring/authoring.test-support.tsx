import { QueryClientProvider } from '@tanstack/react-query';
import { HttpClientError } from '@nevo/http-client';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { ApiError } from '../../../api';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { stubLayoutApis } from '../../../../test-support/app/stubLayoutApis';
import type { TaskAuthoringApi } from './api';

export const SPEC = 'sso';
export const TASK = 't-04';

/** A Task authoring port whose every method is a mock (override the ones a test uses). */
export function fakeTaskAuthoringApi(overrides: Partial<TaskAuthoringApi> = {}) {
  const never = () => new Promise<never>(() => undefined);

  return {
    specificationActions: vi.fn(never),
    taskActions: vi.fn(never),
    createTask: vi.fn(never),
    editTask: vi.fn(never),
    removeTask: vi.fn(never),
    setStatus: vi.fn(never),
    documentTree: vi.fn(never),
    addDocuments: vi.fn(never),
    operateDocument: vi.fn(never),
    catalogue: vi.fn(never),
    searchProjectDocuments: vi.fn(never),
    ...overrides,
  } satisfies TaskAuthoringApi;
}

/** A refusal as the transport raises it: classified, the body kept as its cause. */
export function refusal(code: string, status = 409, details?: Record<string, unknown>) {
  return new ApiError({
    kind: status === 422 ? 'validation' : 'conflict',
    operation: 'tasks',
    outcome: 'not-applied',
    retryable: false,
    status,
    code,
    cause: new HttpClientError('refused', {
      kind: 'http',
      status,
      data: { error: code, code, message: 'display only', ...(details ? { details } : {}) },
    }),
  });
}

export function renderWithAuthoring(ui: ReactNode, api: TaskAuthoringApi) {
  stubLayoutApis();
  const queryClient = createSpecFlowQueryClient();
  const services = createSpecFlowAppServices({ taskAuthoringApi: api });

  return render(
    <QueryClientProvider client={queryClient}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>{ui}</LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
}

export function resourceFixture(overrides: Partial<TaskResourceFacts> = {}): TaskResourceFacts {
  return {
    revision: 'rev-1',
    type: 'ui',
    status: 'draft',
    dependsOn: [],
    origin: { kind: 'manual', actorId: 'user:ann' },
    documents: [
      { id: 'task', path: 'task.md', type: 'task' },
      { id: 'screens', path: 'screens.md', type: 'notes' },
    ],
    context: null,
    readiness: { kind: 'status', status: 'draft' },
    facts: {
      preparation: 'draft',
      escalated: false,
      position: { state: 'not-started' },
      startable: false,
      startBlockers: [{ kind: 'status', status: 'draft' }],
      definitionChanged: false,
    },
    position: { state: 'not-started' },
    definitionChanged: false,
    ...overrides,
  };
}

const allowed = { kind: 'allowed' } as const;

/** A draft Task's projection: everything but Resume allowed; blockers as given. */
export function taskProjection(
  blockers: Extract<WorkflowActionProjection['position'], { kind: 'blocked' }>['blockers'] = [],
  task: Partial<NonNullable<WorkflowActionProjection['task']>> = {},
): WorkflowActionProjection {
  return {
    subject: { kind: 'task', specId: SPEC, taskId: TASK },
    position: { kind: 'blocked', blockers: [{ kind: 'status', status: 'draft' }, ...blockers] },
    actions: {},
    task: {
      approve: allowed,
      hold: allowed,
      resume: { kind: 'unavailable', reason: 'status' },
      cancel: allowed,
      remove: allowed,
      editDetails: allowed,
      editContext: allowed,
      editDependencies: allowed,
      ...task,
    },
  };
}
