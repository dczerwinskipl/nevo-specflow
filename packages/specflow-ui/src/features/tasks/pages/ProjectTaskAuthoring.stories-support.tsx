import type { TaskDocumentTree, TaskResourceFacts } from '@nevo/specflow-contracts/tasks';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import type { SpecificationTaskResponse } from '@nevo/specflow-contracts/specs/workspace';
import { documentContentFixture } from '../../../../test-support/documents/fixtures';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import { createTaskDetailFixture } from '../detail/taskDetail.test-support';
import type { SpecificationWorkspaceData } from '../../specs/read-model';
import type { TaskAuthoringApi } from '../authoring/api';
import type { DocumentApi } from '../../documents/api';

/*
 * Story fixtures of Task authoring (project mode): the accepted mock's scenario (Single sign-on,
 * T-04 "Return users to where they were") as the Runtime contracts deliver it.
 */

export const SPEC = 'sso';
export const TASK = 't-04';
export type AuthoringScenario = 'draft-problems' | 'started' | 'empty-specification';

const allowed = { kind: 'allowed' } as const;

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
    context: [
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
        kind: 'instructions',
        text: 'Keep the existing Back behaviour for deep links.',
        required: true,
      },
    ],
    readiness: started ? { kind: 'ready' } : { kind: 'status', status: 'draft' },
    lane: started ? 'in-progress' : 'needs-approval',
    position: started
      ? { state: 'active', step: 'implement', attempt: 1 }
      : { state: 'not-started' },
    definitionChanged: false,
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

export function workspaceData(scenario: AuthoringScenario): SpecificationWorkspaceData {
  const base = createSpecificationWorkspaceFixture('working', SPEC);
  const row = (
    id: string,
    title: string,
    statusId: string,
    typeTitle: string,
    dependsOn: string[] = [],
  ) => ({
    id,
    title,
    status: 'pending',
    statusCode: 'pending' as const,
    lifecycle: 'pending' as const,
    statusId,
    typeTitle,
    dependsOn,
    group: '',
  });

  return {
    ...base,
    id: SPEC,
    title: 'Single sign-on',
    intro:
      'Employees sign in through the company identity provider and return to the project they had open.',
    isEmpty: scenario === 'empty-specification',
    overviewDocumentId: 'overview',
    documents: [
      { id: 'overview', title: 'Overview', filename: 'overview.md', kind: 'overview' },
      { id: 'ux', title: 'UX', filename: 'ux.md', kind: 'ux' },
      {
        id: 'requirements',
        title: 'Requirements',
        filename: 'requirements.md',
        kind: 'requirements',
      },
    ],
    completedTasksCount: scenario === 'empty-specification' ? 0 : 1,
    totalTasksCount: scenario === 'empty-specification' ? 0 : 5,
    taskGroups:
      scenario === 'empty-specification'
        ? []
        : [
            {
              id: 'needs-approval',
              name: 'Needs approval',
              tasks: [
                row('t-02', 'Token exchange endpoint and session cookie', 'draft', 'Backend', [
                  't-01',
                ]),
                row(TASK, 'Return users to where they were', 'draft', 'UI', ['t-02', 't-03']),
              ],
            },
            {
              id: 'ready',
              name: 'Ready to start',
              tasks: [row('t-07', 'Rate-limit session refresh', 'ready', 'Backend')],
            },
            {
              id: 'done',
              name: 'Done',
              tasks: [row('t-01', 'Evaluate identity provider SDKs', 'completed', 'Spike')],
            },
            {
              id: 'held',
              name: 'On hold or cancelled',
              tasks: [
                row('t-03', 'Sign-in button and provider redirect', 'on-hold', 'UI'),
                row('t-05', 'Audit log of sign-in events', 'cancelled', 'Backend'),
              ],
            },
          ],
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
