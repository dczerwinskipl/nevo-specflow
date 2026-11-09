import type {
  AgentArchetypeDefinitionFile,
  TaskTypeDefinitionFile,
  WorkflowDefinitionFile,
} from './workflow-definition-files';

type Json = Record<string, unknown>;

export const agentArchetypeFile = (): AgentArchetypeDefinitionFile => ({
  kind: 'agent-archetype',
  schemaVersion: 1,
  id: 'reviewer',
  title: 'Reviewer',
  description: 'Independent, evidence-based review of a scoped change.',
  profile: 'nevo-agents:reviewer',
  preferredProvider: 'codex',
  providers: [
    { provider: 'codex', model: 'gpt-5.5', effort: 'high' },
    { provider: 'claude', model: 'claude-opus-5-5' },
    { provider: 'antigravity' },
  ],
});

export const taskTypeFile = (): TaskTypeDefinitionFile => ({
  kind: 'task-type',
  schemaVersion: 1,
  id: 'implementation',
  title: 'Implementation',
  description: 'A scoped code change with review.',
  useWhen: 'The task changes production code.',
  workflow: 'task-standard',
});

export const workflowFile = (): WorkflowDefinitionFile => ({
  kind: 'workflow',
  schemaVersion: 1,
  id: 'task-standard',
  version: 1,
  title: 'Standard task',
  description: 'Implement, then review.',
  subject: 'task',
  entryStep: 'implement',
  steps: [
    {
      id: 'implement',
      kind: 'work',
      title: 'Implement',
      executor: 'agent',
      archetype: 'implementer',
      purpose: 'Make the change.',
      transitions: [{ id: 'done', to: { step: 'review' }, continuation: 'auto', session: 'fresh' }],
    },
    {
      id: 'review',
      kind: 'work',
      title: 'Review',
      executor: 'agent',
      archetype: 'reviewer',
      purpose: 'Review the change.',
      transitions: [
        { id: 'accept', result: 'pass', to: { terminal: 'completed' } },
        {
          id: 'reject',
          result: 'fail',
          to: { step: 'implement' },
          feedback: 'required',
          continuation: 'auto',
          session: 'reuse',
        },
        {
          id: 'escalated',
          result: 'needs-spec-change',
          to: { step: 'implement' },
          feedback: 'required',
          escalate: true,
        },
      ],
    },
  ],
  returns: [{ step: 'implement', effects: [] }],
});

export const invalidAgentArchetypeFiles: [string, () => Json][] = [
  ['a wrong kind', () => ({ ...agentArchetypeFile(), kind: 'workflow' })],
  ['an unknown key', () => ({ ...agentArchetypeFile(), extra: 1 })],
  ['a provider without an id', () => ({ ...agentArchetypeFile(), providers: [{ model: 'x' }] })],
  [
    'an empty model',
    () => ({ ...agentArchetypeFile(), providers: [{ provider: 'codex', model: '' }] }),
  ],
];

export const invalidTaskTypeFiles: [string, () => Json][] = [
  ['a missing workflow', () => ({ ...taskTypeFile(), workflow: undefined })],
  ['an unknown key', () => ({ ...taskTypeFile(), extra: 1 })],
];

const withStep = (step: Json): Json => ({ ...workflowFile(), steps: [step] });

export const invalidWorkflowFiles: [string, () => Json][] = [
  ['an unknown subject', () => ({ ...workflowFile(), subject: 'project' })],
  ['no steps', () => ({ ...workflowFile(), steps: [] })],
  ['a step without transitions', () => withStep({ ...workflowFile().steps[0], transitions: [] })],
  [
    'an unknown terminal',
    () =>
      withStep({
        ...workflowFile().steps[0],
        transitions: [{ id: 'done', to: { terminal: 'merged' } }],
      }),
  ],
  [
    'a target with both a step and a terminal',
    () =>
      withStep({
        ...workflowFile().steps[0],
        transitions: [{ id: 'done', to: { step: 'review', terminal: 'completed' } }],
      }),
  ],
  [
    'an unknown effect',
    () =>
      withStep({
        ...workflowFile().steps[0],
        transitions: [{ id: 'done', to: { step: 'review' }, effects: ['delete-tasks'] }],
      }),
  ],
  [
    'a removed effect',
    () =>
      withStep({
        ...workflowFile().steps[0],
        transitions: [{ id: 'done', to: { step: 'review' }, effects: ['block-pending-tasks'] }],
      }),
  ],
  [
    'an escalation marker that is not a boolean',
    () =>
      withStep({
        ...workflowFile().steps[0],
        transitions: [{ id: 'done', to: { step: 'review' }, escalate: 'specification' }],
      }),
  ],
  [
    'an unknown wait trigger',
    () =>
      withStep({
        id: 'wait',
        kind: 'wait-for-tasks',
        title: 'Wait',
        purpose: 'Wait.',
        transitions: [{ id: 'done', on: 'task-started', to: { terminal: 'completed' } }],
      }),
  ],
  [
    'an executor on a wait step',
    () =>
      withStep({
        id: 'wait',
        kind: 'wait-for-tasks',
        title: 'Wait',
        purpose: 'Wait.',
        executor: 'agent',
        transitions: [{ id: 'done', to: { terminal: 'completed' } }],
      }),
  ],
];
