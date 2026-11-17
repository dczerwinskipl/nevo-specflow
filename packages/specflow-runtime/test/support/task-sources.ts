import type {
  ExecutionFacts,
  HistoryFacts,
  ResourceFacts,
  SourcePage,
  SourceRead,
  TaskDefinitionFacts,
  TaskIdentity,
} from '../../src/features/tasks/reads/facts';

/**
 * Small fixed Task read sources for the read-layer tests (authorization, visibility, leases): every
 * Task `task-NN` of any Specification exists, has a two-step workflow and one history entry. The
 * Engine-backed sources are tested in their own files; these only feed the generic read path.
 */

export const identityFor = (specId: string, taskId: string): TaskIdentity => ({
  projectId: 'demo-project',
  workspaceId: 'demo-workspace',
  specId,
  taskId,
});

const build = {
  id: 'build',
  executors: ['agent' as const],
  purpose: 'Implement the change.',
  expectedWork: { summary: 'Implement the change' },
  hints: [],
};
const verify = {
  id: 'verify',
  executors: ['human' as const],
  purpose: 'Check the change.',
  expectedWork: { summary: 'Manual verification' },
  hints: [],
};

export function fixtureExecution(specId: string, taskId: string): ExecutionFacts {
  const key = { specId, taskId, stepId: 'verify', attempt: 1 };
  const transitions = [
    {
      id: 'passed',
      label: 'Passed',
      feedbackRequired: false,
      target: { kind: 'terminal' as const, status: 'completed', outcome: 'success' as const },
    },
  ];

  return {
    identity: identityFor(specId, taskId),
    definitionVersion: 'fixture-definition-1',
    version: 'fixture-task-1',
    workflow: {
      definition: {
        id: 'fixture',
        title: 'Fixture workflow',
        description: null,
        revision: 'fixture-definition-1',
        steps: [
          {
            step: build,
            transitions: [
              {
                id: 'built',
                label: 'Built',
                feedbackRequired: false,
                target: { kind: 'step', step: verify },
              },
            ],
          },
          { step: verify, transitions },
        ],
      },
      position: { state: 'active', key, step: verify, semanticStatus: 'awaiting-human' },
      transitions,
      blockers: [],
      previousFeedback: null,
    },
  };
}

/** Linked materials a history entry carries (each a link the read checks for visibility). */
export function fixtureResources(specId: string, taskId: string, count = 4): ResourceFacts[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `document-${i + 1}`,
    title: `Verification material ${i + 1}`,
    kind: 'document',
    relation: 'output',
    producedFor: [{ specId, taskId, stepId: 'build', attempt: 1 }],
    neededFor: [],
    origin: { kind: 'completion', sourceId: 'build-1' },
    link: {
      state: 'available',
      target: { kind: 'document', specId, documentId: 'overview', revision: 'document-1' },
    },
  }));
}

export function fixtureHistory(specId: string, taskId: string): HistoryFacts[] {
  return [
    {
      id: 'build-1',
      key: { specId, taskId, stepId: 'build', attempt: 1 },
      step: build,
      startedAt: null,
      completedAt: null,
      result: 'pass',
      transitionedTo: null,
      feedback: null,
      actor: { class: 'agent' },
      resources: [],
      provenance: [{ source: 'workflow_history', sourceId: 'build-1' }],
    },
  ];
}

const HISTORY = 'fixture-history-1';

export function createFixtureTaskSources(
  options: { readonly titles?: (specId: string) => string | undefined } = {},
) {
  const definitions = {
    resolve(specId: string, taskId: string): Promise<TaskDefinitionFacts | null> {
      const title = options.titles ? options.titles(specId) : specId;
      if (title === undefined || !/^task-\d\d$/u.test(taskId)) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        identity: identityFor(specId, taskId),
        version: 'fixture-definition-1',
        specificationTitle: title,
        task: {
          id: taskId,
          title: `Task ${taskId}`,
          status: { id: 'in-progress', label: 'In progress', lifecycle: 'in_progress' },
        },
        purpose: 'Fixture Task',
        acceptanceCriteria: [],
        summary: 'Fixture Task',
        group: { id: 'implementation', label: 'Implementation' },
        taskType: null,
        document: { state: 'available', data: { id: 'task', revision: 'document-1' } },
        dependencies: [],
      });
    },
  };
  const open = async (identity: TaskIdentity): Promise<SourceRead | null> =>
    (await definitions.resolve(identity.specId, identity.taskId))
      ? { identity, handle: HISTORY, version: HISTORY, coverage: 'complete' }
      : null;

  return {
    definitions,
    execution: {
      async inspect(identity: TaskIdentity, version: string) {
        const definition = await definitions.resolve(identity.specId, identity.taskId);

        return definition?.version === version
          ? fixtureExecution(identity.specId, identity.taskId)
          : null;
      },
    },
    history: {
      open,
      async read(
        identity: TaskIdentity,
        handle: string,
        continuation: string | null,
        limit: number,
      ): Promise<SourcePage<HistoryFacts> | null> {
        if (handle !== HISTORY || !(await open(identity))) {
          return null;
        }

        const items = fixtureHistory(identity.specId, identity.taskId);
        const start = continuation === null ? 0 : Number(continuation);
        const end = Math.min(start + limit, items.length);

        return {
          identity,
          version: HISTORY,
          items: items.slice(start, end),
          next: end < items.length ? String(end) : null,
          coverage: 'complete',
        };
      },
    },
  };
}
