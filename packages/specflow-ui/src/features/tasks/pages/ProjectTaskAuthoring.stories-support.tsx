import type {
  SpecificationTaskResponse,
  SpecificationWorkspaceResponse,
} from '@nevo/specflow-contracts/specs/workspace';
import type { TaskDocumentTree, TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import type { TaskAuthoring, WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { documentContentFixture } from '../../../../test-support/documents/fixtures';
import { createWorkspaceIntegrationApi } from '../../../../test-support/specs/workspace/api';
import { createTaskDetailFixture } from '../detail/taskDetail.test-support';
import type { TaskAuthoringApi } from '../authoring/api';
import type { DocumentApi } from '../../documents/api';

/*
 * Story fixtures of Task authoring (project mode): the accepted mock's scenario (Single sign-on,
 * t-04 "Return users to where they were") as the Runtime contracts deliver it. Task ids are
 * lowercase: the Engine's Task id pattern allows lowercase letters, digits and dashes only.
 */

export const SPEC = 'sso';
export const TASK = 't-04';
export type AuthoringScenario = 'draft-problems' | 'started' | 'empty-specification';

const allowed = { kind: 'allowed' } as const;
type Entry = TaskAuthoring['context']['entries'][number]['entry'];

const context: readonly Entry[] = [
  { kind: 'task-document', id: 'task', required: true },
  {
    kind: 'task-document',
    id: 'screens',
    required: true,
    note: 'Return-flow screens and their states',
  },
  { kind: 'specification-document', id: 'overview', required: true },
  {
    kind: 'specification-document',
    id: 'ux',
    required: true,
    note: 'Sign-in flow and where the user returns',
  },
  {
    kind: 'project-document',
    id: 'product.specflow.ui.interaction-model',
    required: false,
    note: 'Back and Close semantics',
  },
  {
    kind: 'path',
    path: 'packages/specflow-ui/src/app/router/**',
    required: true,
    note: 'Where the previous route is restored',
  },
  { kind: 'specification-document', id: 'refresh-findings', required: true, artifact: true },
  { kind: 'specification-document', id: 'old-login-flow', required: true },
  {
    kind: 'specification-document',
    id: 'legacy-navigation',
    required: false,
    note: 'Superseded by the interaction model',
  },
  {
    kind: 'instructions',
    text: 'Keep the existing Back behaviour for deep links.',
    required: true,
  },
];

export function taskResource(scenario: AuthoringScenario): TaskResourceFacts {
  const started = scenario === 'started';

  return {
    revision: 'rev-7',
    type: 'ui',
    status: started ? 'ready' : 'draft',
    dependsOn: ['t-02', 't-03'],
    origin: { kind: 'manual', actorId: 'user:dominik' },
    documents: [
      { id: 'task', path: 'task.md', type: 'task' },
      { id: 'screens', path: 'screens.md', type: 'notes' },
    ],
    context: [...context],
    readiness: started ? { kind: 'ready' } : { kind: 'status', status: 'draft' },
    lane: started ? 'in-progress' : 'needs-approval',
    position: started
      ? { state: 'active', step: 'implement', attempt: 1 }
      : { state: 'not-started' },
    definitionChanged: false,
  };
}

/** The Engine's view of the context: the awaited artifact and two references that do not resolve. */
function authoring(scenario: AuthoringScenario): TaskAuthoring {
  return {
    context: {
      isDefault: false,
      entries: context.map((entry) =>
        entry.kind === 'specification-document' && entry.id === 'refresh-findings'
          ? { entry, state: 'awaited' as const }
          : entry.kind === 'specification-document' &&
              (entry.id === 'old-login-flow' || entry.id === 'legacy-navigation')
            ? { entry, state: 'unresolved' as const, reason: 'not-found' as const }
            : { entry, state: 'resolved' as const },
      ),
    },
    dependencyCandidates:
      scenario === 'started'
        ? []
        : [
            { taskId: 't-02', unavailable: 'dependency' },
            { taskId: 't-07', unavailable: 'would-create-cycle' },
            { taskId: 't-01' },
            { taskId: 't-03', unavailable: 'dependency' },
            { taskId: 't-05', unavailable: 'cancelled' },
          ],
  };
}

export function taskProjection(scenario: AuthoringScenario): WorkflowActionProjection {
  const started = scenario === 'started';

  return {
    subject: { kind: 'task', specId: SPEC, taskId: TASK },
    position: started
      ? {
          kind: 'active',
          step: { id: 'implement', title: 'Implementation', kind: 'work', purpose: 'Build it.' },
          attempt: {
            number: 1,
            startedAt: '2026-11-12T09:00:00Z',
            actor: { class: 'human', details: { actorId: 'user:dominik', trust: 'local' } },
          },
        }
      : {
          kind: 'blocked',
          blockers: [
            { kind: 'status', status: 'draft' },
            {
              kind: 'context-unresolved',
              entries: [{ index: 7, kind: 'specification-document', reason: 'not-found' }],
            },
            { kind: 'context-awaited', entries: [{ index: 6, kind: 'specification-document' }] },
          ],
        },
    actions: {},
    task: {
      approve: started ? { kind: 'unavailable', reason: 'status' } : allowed,
      hold: started ? { kind: 'unavailable', reason: 'active-attempt' } : allowed,
      resume: { kind: 'unavailable', reason: 'status' },
      cancel: allowed,
      remove: started ? { kind: 'unavailable', reason: 'started' } : allowed,
      editDetails: allowed,
      editContext: allowed,
      editDependencies: started ? { kind: 'unavailable', reason: 'started' } : allowed,
    },
    taskAuthoring: authoring(scenario),
  };
}

export function taskResponse(scenario: AuthoringScenario): SpecificationTaskResponse {
  const base = createTaskDetailFixture('not-started').response;

  return {
    ...base,
    task: {
      id: TASK,
      title: 'Return users to where they were',
      status: { id: 'draft', label: 'Draft', lifecycle: 'pending' },
    },
    resource: taskResource(scenario),
    ...(base.snapshot
      ? {
          snapshot: {
            ...base.snapshot,
            specification: { id: SPEC, title: 'Single sign-on' },
            taskType: { id: 'ui', label: 'UI' },
            summary:
              'Return users to the project, document and scroll position they had open before the identity provider redirected them away.',
          },
        }
      : {}),
  };
}

const documentTree: TaskDocumentTree = {
  taskId: TASK,
  registryRevision: 'reg-1',
  writable: true,
  documents: [
    {
      id: 'task',
      path: 'task.md',
      type: 'task',
      classification: 'registered',
      required: true,
      file: { kind: 'text', mediaType: 'text/markdown', size: 400, revision: 'f1', editable: true },
    },
    {
      id: 'screens',
      path: 'screens.md',
      type: 'notes',
      classification: 'registered',
      required: false,
      file: { kind: 'text', mediaType: 'text/markdown', size: 200, revision: 'f2', editable: true },
    },
  ],
};

type WireTask = SpecificationWorkspaceResponse['sections']['tasks'] extends infer S
  ? S extends { state: 'available'; data: { groups: (infer G)[] } }
    ? G extends { tasks: (infer T)[] }
      ? T
      : never
    : never
  : never;

function row(
  id: string,
  title: string,
  status: { id: string; label: string; lifecycle: WireTask['status']['lifecycle'] },
  type: string,
  dependsOn: string[] = [],
): WireTask {
  return { id, title, status, type: { id: type.toLowerCase(), title: type }, dependsOn };
}

const draft = { id: 'draft', label: 'Draft', lifecycle: 'pending' } as const;

/** The workspace read of Single sign-on, wire format (the real mapper and route render it). */
export async function workspaceResponse(
  scenario: AuthoringScenario,
): Promise<SpecificationWorkspaceResponse> {
  const base = await createWorkspaceIntegrationApi().getSpecificationWorkspace('api-integration');
  const empty = scenario === 'empty-specification';

  return {
    ...base,
    specification: {
      ...base.specification,
      id: SPEC,
      title: 'Single sign-on',
      summary:
        'Employees sign in through the company identity provider and return to the project they had open.',
      preparationState: empty ? 'empty' : 'prepared',
    },
    sections: {
      ...base.sections,
      documents: {
        state: 'available',
        data: {
          overviewDocumentId: 'overview',
          items: [
            { id: 'overview', title: 'Overview', filename: 'overview.md', kind: 'overview' },
            { id: 'ux', title: 'UX', filename: 'ux.md', kind: 'ux' },
            {
              id: 'requirements',
              title: 'Requirements',
              filename: 'requirements.md',
              kind: 'requirements',
            },
          ],
        },
      },
      tasks: {
        state: 'available',
        data: {
          completed: empty ? 0 : 1,
          total: empty ? 0 : 5,
          attention: [],
          groups: empty
            ? []
            : [
                {
                  id: 'needs-approval',
                  name: 'Needs approval',
                  tasks: [
                    row('t-02', 'Token exchange endpoint and session cookie', draft, 'Backend', [
                      't-01',
                    ]),
                    row(TASK, 'Return users to where they were', draft, 'UI', ['t-02', 't-03']),
                  ],
                },
                {
                  id: 'ready',
                  name: 'Ready to start',
                  tasks: [
                    row(
                      't-07',
                      'Rate-limit session refresh',
                      { id: 'ready', label: 'Ready', lifecycle: 'pending' },
                      'Backend',
                      [TASK],
                    ),
                  ],
                },
                {
                  id: 'done',
                  name: 'Done',
                  tasks: [
                    row(
                      't-01',
                      'Evaluate identity provider SDKs',
                      { id: 'completed', label: 'Completed', lifecycle: 'completed' },
                      'Spike',
                    ),
                  ],
                },
                {
                  id: 'held',
                  name: 'On hold or cancelled',
                  tasks: [
                    row(
                      't-03',
                      'Sign-in button and provider redirect',
                      { id: 'on-hold', label: 'On hold', lifecycle: 'blocked' },
                      'UI',
                    ),
                    row(
                      't-05',
                      'Audit log of sign-in events',
                      { id: 'cancelled', label: 'Cancelled', lifecycle: 'blocked' },
                      'Backend',
                    ),
                  ],
                },
              ],
        },
      },
    },
  };
}

export function authoringApi(scenario: AuthoringScenario): TaskAuthoringApi {
  const pending = () => new Promise<never>(() => undefined);

  return {
    specificationActions: () =>
      Promise.resolve({
        subject: { kind: 'specification', specId: SPEC },
        position: {
          kind: 'not-started',
          preview: {
            workflowId: 'feature',
            version: 3,
            revision: 'r3',
            title: 'Feature specification',
            firstStep: 'requirements',
            firstStepTitle: 'Requirements',
            steps: [{ id: 'requirements', title: 'Requirements', next: ['end'] }],
          },
          next: {
            step: {
              id: 'requirements',
              title: 'Requirements',
              kind: 'work',
              purpose: 'Agree the requirements.',
            },
            human: true,
            agent: { kind: 'unavailable', reason: 'provider-not-chosen' },
          },
        },
        actions: {},
        specification: {
          createTask: allowed,
          taskTypes: [
            {
              id: 'spike',
              title: 'Spike',
              description: 'Time-boxed investigation that ends with a written finding.',
              useWhen: 'Unknowns',
              workflow: {
                id: 'research',
                title: 'Research',
                steps: [{ id: 'spike', title: 'Spike' }],
              },
            },
            {
              id: 'backend',
              title: 'Backend',
              description: 'Server or Engine change, reviewed before it counts as done.',
              useWhen: 'Server work',
              workflow: {
                id: 'build',
                title: 'Build and review',
                steps: [
                  { id: 'design', title: 'Design' },
                  { id: 'implement', title: 'Implementation' },
                  { id: 'review', title: 'Review' },
                ],
              },
            },
            {
              id: 'ui',
              title: 'UI',
              description: 'Screen or component change with an owner UX acceptance.',
              useWhen: 'UI work',
              workflow: {
                id: 'ui-build',
                title: 'UI build',
                steps: [
                  { id: 'implement', title: 'Implementation' },
                  { id: 'review', title: 'Review' },
                  { id: 'accept', title: 'UX acceptance' },
                ],
              },
            },
          ],
        },
      }),
    taskActions: () => Promise.resolve(taskProjection(scenario)),
    createTask: pending,
    editTask: pending,
    removeTask: pending,
    setStatus: pending,
    documentTree: () => Promise.resolve(documentTree),
    addDocuments: pending,
    operateDocument: pending,
    catalogue: pending,
    searchProjectDocuments: pending,
  };
}

export const taskDocumentApi: DocumentApi = {
  getDocument: (_scope, documentId) =>
    Promise.resolve(
      documentContentFixture({
        id: documentId,
        path: documentId === 'task' ? 'task.md' : `${documentId}.md`,
        title: 'Return users to where they were',
        type: documentId === 'task' ? 'task' : 'notes',
        content:
          documentId === 'task'
            ? '# Return users to where they were\n\n## Goal\n\nAfter a successful sign-in, restore the project, document and scroll position the user had open.\n\n## Acceptance\n\n- The previous route is kept in the sign-in state and restored after the callback.\n- Scroll position and open document tab are restored.\n'
            : '# Screens\n\nReturn-flow screens and their states.\n',
        revision: 'f1',
      }),
    ),
};
