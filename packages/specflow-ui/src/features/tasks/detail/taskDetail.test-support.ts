import type {
  SpecificationTaskResponse,
  TaskResource,
} from '@nevo/specflow-contracts/specs/workspace';
import { markdownIntro } from '../../documents/description/markdownIntro';
import { taskResourceFixture } from '../../../../test-support/tasks/resource';

/** `rich-human`: an active step a person works on, with hints and returned feedback. */
export type TaskScenario = 'rich-human' | 'not-started';

/** A Task read for stories and tests of the Task page and its history. */
export function createTaskDetailFixture(scenario: TaskScenario = 'rich-human') {
  const specId = 'admission';
  const taskId = 'return-context';
  const title = 'Preserve session and navigation context';
  const document = `# ${title}\n\nPreserve **user context** when returning from [related work](https://example.com).\n\n## Acceptance criteria\n\n- Return to the original task.\n- Restore scroll and keyboard focus.\n`;
  const key = { specId, taskId, stepId: 'verify', attempt: scenario === 'rich-human' ? 2 : 1 };
  const step = {
    id: 'verify',
    executors: ['human' as const],
    purpose: 'Check return navigation, session expiry and two browser tabs.',
    expectedWork: { summary: 'Verify session behaviour' },
    hints:
      scenario === 'rich-human'
        ? [
            { kind: 'doc' as const, ref: 'docs/session-return.md' },
            { kind: 'skill' as const, ref: 'nevo-agents-reviewer' },
            { kind: 'file' as const, ref: 'src/session.ts' },
          ]
        : [],
  };
  const buildStep = {
    id: 'build',
    executors: ['agent' as const],
    purpose: 'Implement the change.',
    expectedWork: { summary: 'Implement session behaviour' },
    hints: [],
  };
  const transitions = [
    {
      id: 'passed',
      label: 'Scenarios passed',
      feedbackRequired: false,
      target: { kind: 'terminal' as const, status: 'done', outcome: 'success' as const },
    },
    {
      id: 'returned',
      label: 'Return for correction',
      feedbackRequired: true,
      target: { kind: 'step' as const, step: buildStep },
    },
  ];
  /** Materials a history entry can carry. */
  const resources: TaskResource[] = Array.from({ length: 3 }, (_, index) => ({
    id: `resource-${index}`,
    title: `Verification material ${index + 1}`,
    kind: 'document',
    relation: 'output',
    producedFor: [{ ...key, stepId: 'build', attempt: 1 }],
    neededFor: [],
    origin: { kind: 'completion', sourceId: `build-${index}` },
    link: {
      state: 'available',
      target: { kind: 'document', specId, documentId: `document-${index}`, revision: 'fixture-1' },
    },
  }));

  const response: SpecificationTaskResponse = {
    task: {
      id: taskId,
      title,
      status: { id: 'verification', label: 'Verification', lifecycle: 'in_progress' },
    },
    acceptanceCriteria: [],
    resource: taskResourceFixture(),
    snapshot: {
      revision: 'fixture-1',
      specification: { id: specId, title: 'Session context' },
      group: null,
      taskType: null,
      summary: markdownIntro(document, title).intro,
      sections: {
        work: {
          state: 'available',
          data: {
            definition: {
              id: 'custom-flow',
              title: 'Implementation with manual verification',
              description: 'Use this flow when changes need human verification.',
              revision: 'definition-1',
              steps: [
                {
                  step: buildStep,
                  transitions: [
                    {
                      id: 'implemented',
                      label: 'Ready for verification',
                      feedbackRequired: false,
                      target: { kind: 'step', step },
                    },
                  ],
                },
                { step, transitions },
              ],
            },
            position:
              scenario === 'not-started'
                ? { state: 'not_started', next: step }
                : { state: 'active', key, step, semanticStatus: 'verification' },
            blockers: [],
            transitions,
            previousFeedback:
              scenario === 'rich-human'
                ? {
                    key: { ...key, attempt: 1 },
                    result: 'fail',
                    text: 'Return navigation lost the original scroll position.',
                  }
                : null,
          },
        },
        document: {
          state: 'available',
          data: {
            id: 'task',
            revision: 'fixture-1',
            hasMore: markdownIntro(document, title).hasMore,
          },
        },
        dependencies: { state: 'available', data: { items: [] } },
        history: { state: 'available', data: { token: 'fixture-1', initialLimit: 5 } },
      },
    },
  };

  return { response, resources, document, step, key };
}
