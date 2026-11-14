import { useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { HttpClientError } from '@nevo/http-client';
import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { ApiError } from '../../../api';
import { createFixtureSpecsOverviewApi } from '../../../../test-support/specs/overview/api';
import { createAuthStore } from '../../../auth/store';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { createSpecFlowRouter } from '../../../app/router';
import { builtInUiModuleRegistry } from '../../../app/ui-modules/builtInUiModules';
import { UiModulesProvider } from '../../../app/ui-modules/UiModulesProvider';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecFlowAppServices } from '../../../services';
import { createTaskDetailFixture } from '../detail/taskDetail.test-support';
import {
  authoringApi,
  taskDocumentApi,
  taskResponse,
  workspaceResponse,
} from '../pages/ProjectTaskAuthoring.stories-support';
import type { WorkflowExecutionApi } from './api';
import {
  SPEC,
  TASK,
  closeBlockers,
  dominik,
  specificationWorkflowProjection,
  taskResourceFor,
  taskWorkflowProjection,
  type SpecificationWorkflowScenario,
  type TaskWorkflowScenario,
} from './projections.stories-support';

/*
 * Manual workflow execution of a project Runtime in the routed application (shell, navigation,
 * Specification Overview and Full Task routes); only the Runtime ports are fakes. Some fakes keep
 * state so a story can walk a refusal or a round trip (a workflow that changes during the first
 * start; a gate met after its document was created).
 */

export type WorkflowStoryScenario =
  TaskWorkflowScenario | 'start-drift' | 'spike-gate-round-trip' | SpecificationWorkflowScenario;

const specScenarios: readonly string[] = ['waiting', 'close-blocked', 'abandoned'];

export function refusal(code: string, data: Record<string, unknown> = {}) {
  return new ApiError({
    kind: 'conflict',
    operation: 'workflow',
    outcome: 'not-applied',
    retryable: false,
    status: 409,
    code,
    cause: new HttpClientError('refused', {
      kind: 'http',
      status: 409,
      data: { error: code, code, message: 'display only', ...data },
    }),
  });
}

const never = () => new Promise<never>(() => undefined);

function services(scenario: WorkflowStoryScenario) {
  const state = { version: 4, findings: false };
  const taskScenario = (): TaskWorkflowScenario =>
    scenario === 'start-drift'
      ? 'first-start'
      : scenario === 'spike-gate-round-trip'
        ? state.findings
          ? 'spike-gate-met'
          : 'spike-gate'
        : (scenario as TaskWorkflowScenario);
  const taskProjection = (): WorkflowActionProjection =>
    taskWorkflowProjection(taskScenario(), { version: state.version });
  const authoring = authoringApi('started');
  const workflowExecutionApi: WorkflowExecutionApi = {
    start: (_subject, input) => {
      if (scenario === 'start-drift' && input.expectedWorkflowRevision === 'rev-build-4') {
        // The workflow changed while the dialog was open.
        state.version = 5;

        return Promise.reject(refusal('WORKFLOW_DEFINITION_CHANGED'));
      }

      return never();
    },
    finish: never,
    returnTo: never,
    abandon: never,
    closePreview: () =>
      scenario === 'abandoned'
        ? Promise.resolve({ operationId: '6f1c1f43-6c4e-4c5c-9f60-1d3f3a9a1b20' })
        : Promise.reject(refusal('CLOSE_BLOCKED', { blockers: closeBlockers })),
    close: never,
  };
  const defaults = createSpecFlowAppServices();

  return createSpecFlowAppServices({
    authStore: createAuthStore(defaults.authApi, {
      authenticationRequired: false,
      authenticated: false,
      user: { id: 'story', name: 'Demo' },
      loginMethods: { password: { enabled: false }, oidc: [] },
    }),
    runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
    specsOverviewApi: createFixtureSpecsOverviewApi(),
    specificationApi: { getSpecificationWorkspace: () => specificationWorkspace(scenario) },
    taskApi: {
      getTaskList: never,
      getTask: () => {
        const response = taskResponse('started');

        return Promise.resolve({
          ...response,
          task: { ...response.task, title: 'Token exchange endpoint and session cookie' },
          resource: taskResourceFor(taskScenario()),
          ...(response.snapshot
            ? {
                snapshot: {
                  ...response.snapshot,
                  summary:
                    'Exchange the provider code for a session, set the cookie and refresh it before expiry.',
                },
              }
            : {}),
        });
      },
      getHistory: (_spec, _task, token) =>
        Promise.resolve({ token, items: historyItems(), nextCursor: null, coverage: 'complete' }),
    },
    taskAuthoringApi: {
      ...authoring,
      specificationActions: () =>
        Promise.resolve({
          ...specificationWorkflowProjection(
            specScenarios.includes(scenario)
              ? (scenario as SpecificationWorkflowScenario)
              : 'waiting',
          ),
        }),
      taskActions: () => Promise.resolve(taskProjection()),
      addDocuments: () => {
        state.findings = true;

        return Promise.resolve({
          operationId: 'op-findings',
          revision: 'tree-2',
          documents: [{ id: 'findings', path: 'findings.md', type: 'findings', revision: 'f9' }],
          removedDocumentIds: [],
          folders: [],
          commit: { state: 'not-requested' },
        } as never);
      },
    },
    workflowExecutionApi,
    documentApi: taskDocumentApi,
  });
}

function historyItems() {
  const fixture = createTaskDetailFixture('rich-human');
  const entry = (
    id: string,
    stepId: string,
    title: string,
    attempt: number,
    at: string,
    result: string | null,
    feedback: string | null,
  ) => ({
    id,
    key: { ...fixture.key, stepId, attempt },
    step: {
      ...fixture.step,
      id: stepId,
      executors: ['agent' as const, 'human' as const],
      expectedWork: { summary: title },
    },
    startedAt: at,
    completedAt: result ? at : null,
    result,
    transitionedTo: null,
    feedback,
    actor: { class: 'human' as const, actorId: 'local:dominik' },
    resources: [],
    provenance: [{ source: 'workflow_history' as const, sourceId: id }],
  });

  return [
    entry('h4', 'implement', 'Implementation', 2, '2026-11-13T11:52:00Z', null, null),
    entry(
      'h3',
      'review',
      'Review',
      1,
      '2026-11-13T11:40:00Z',
      'Changes requested',
      'The refresh path drops the original return URL when the cookie expires mid-request. Keep it in the state parameter and add a test for the expiry case.',
    ),
    entry(
      'h2',
      'implement',
      'Implementation',
      1,
      '2026-11-13T10:15:00Z',
      'Ready for review',
      'Endpoint, cookie and refresh are in place.',
    ),
    entry('h1', 'design', 'Design', 1, '2026-11-12T17:20:00Z', 'Approach agreed', null),
  ];
}

/** The workspace read: the waiting Specification's Tasks, or all of them cancelled by abandon. */
async function specificationWorkspace(
  scenario: WorkflowStoryScenario,
): Promise<SpecificationWorkspaceResponse> {
  const base = await workspaceResponse('draft-problems');
  if (scenario !== 'abandoned' || base.sections.tasks.state !== 'available') {
    return base;
  }

  const groups = base.sections.tasks.data.groups;
  const done = groups.filter((group) => group.id === 'done');
  const cancelled = groups
    .filter((group) => group.id !== 'done')
    .flatMap((group) => group.tasks)
    .map((task) => ({
      ...task,
      status: { id: 'cancelled', label: 'Cancelled', lifecycle: 'blocked' as const },
    }));

  return {
    ...base,
    sections: {
      ...base.sections,
      tasks: {
        state: 'available',
        data: {
          ...base.sections.tasks.data,
          completed: 1,
          total: 1,
          groups: [
            ...done,
            {
              id: 'held',
              name: 'On hold or cancelled',
              summary: 'compact' as const,
              collapsed: true,
              tasks: cancelled,
            },
          ],
        },
      },
    },
  };
}

/** The routed application on a Task page or the Specification Overview. */
export function WorkflowExecutionFixture({
  scenario,
}: {
  readonly scenario: WorkflowStoryScenario;
}) {
  const setup = useMemo(() => {
    const query = createSpecFlowQueryClient();
    query.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
    const path = specScenarios.includes(scenario)
      ? `/specs/${SPEC}`
      : `/specs/${SPEC}/tasks/${TASK}`;
    const router = createSpecFlowRouter(
      createMemoryHistory({ initialEntries: [path] }),
      services(scenario),
    );

    return { query, router };
  }, [scenario]);

  return (
    <QueryClientProvider client={setup.query}>
      <UiModulesProvider modules={builtInUiModuleRegistry}>
        <StoryLocalization locale="en">
          <RouterProvider router={setup.router} />
        </StoryLocalization>
      </UiModulesProvider>
    </QueryClientProvider>
  );
}

export { dominik };
