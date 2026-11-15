import type { WorkflowActionProjection, WorkflowActor } from '@nevo/specflow-contracts/workflow';
import type { SessionSummary } from '../../features/specs/read-model';

/*
 * PRESENTATION MOCK DATA (Specification Overview, early and sparse states). Mirrors the real
 * dogfooding Specification created from GitHub issue #156 on this repository: its title, the
 * `feature` archetype's documents and template instructions, and the `specification-standard`
 * workflow's steps and purposes (.nevo/definitions).
 */

export type EarlyScenario =
  /** Just created: the workflow has not started. */
  | 'not-started'
  /** Gather requirements, with the agent Session the owner talks to. */
  | 'requirements'
  /** Write the Specification, by hand: no Session yet, Sessions are offered. */
  | 'write-spec'
  /** Write the Specification with an agent Session working on it. */
  | 'write-spec-session'
  /** Break the solution down: the first two draft Tasks were just created. */
  | 'tasks-created';

/** The active step's index in `workflowSteps` (-1 before the workflow starts). */
export function stepIndex(scenario: EarlyScenario): number {
  return {
    'not-started': -1,
    requirements: 0,
    'write-spec': 1,
    'write-spec-session': 1,
    'tasks-created': 3,
  }[scenario];
}

/**
 * The step whose `produces: tasks` creates the Tasks (`breakdown`), by title and 1-based position:
 * what the empty Tasks section names. A projection read would deliver it; the mock reads the outline.
 */
export const producingStep = { title: 'Break the solution down', position: 4 } as const;

/** The Runtime's Tasks grouping right after the breakdown proposed its first drafts. */
export const firstTasksOverview = {
  rows: [
    {
      groupId: 'needs-approval',
      name: 'Needs approval',
      count: 2,
      tasks: [
        { id: 'cutoff-calibration', title: 'Calibrate and document the cutoff' },
        { id: 'fusion-cutoff', title: 'Drop vector-only hits below minSimilarity' },
      ],
      more: 0,
    },
  ],
  compact: [],
};

export const specTitle = 'Docs search: relevance cutoff for vector-only results';
export const specSlug = 'docs-search-relevance-cutoff';
/** The overview's Goal section (not its first paragraph, which is "Source: GitHub issue #156."). */
export const specGoal =
  'Hybrid documentation search drops vector-only hits below a calibrated relevance cutoff, so nonsense queries return no results while real queries keep their useful top 10.';
export const specSource = 'GitHub issue #156';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const owner: WorkflowActor = {
  class: 'human',
  details: { actorId: 'user:dominikczerwinski', trust: 'local' },
};

/** The `specification-standard` workflow outline (definition order). */
export const workflowSteps = [
  { id: 'requirements', title: 'Gather requirements' },
  { id: 'specification', title: 'Write the Specification' },
  { id: 'solution', title: 'Design the solution' },
  { id: 'breakdown', title: 'Break the solution down' },
  { id: 'breakdown-review', title: 'Review the breakdown' },
  { id: 'implementation', title: 'Waiting for Tasks' },
  { id: 'acceptance', title: 'Acceptance' },
] as const;

export type StepState = 'done' | 'current' | 'upcoming';

export function stepStates(scenario: EarlyScenario): Record<string, StepState> {
  const current =
    scenario === 'not-started' ? -1 : scenario === 'requirements' ? 0 : 1; /* specification */

  return Object.fromEntries(
    workflowSteps.map((step, index) => [
      step.id,
      index < current ? 'done' : index === current ? 'current' : 'upcoming',
    ]),
  );
}

export interface MockDocument {
  readonly id: string;
  /** The document's own H1 after the template fix (no repeated Specification title). */
  readonly title: string;
  readonly filename: string;
  /** `template`: unchanged since it was created from its template; `written`: changed since. */
  readonly state: 'template' | 'written';
  readonly updatedMinutesAgo?: number;
  /** The archetype template's instructions: what the document needs (shown while it is a template). */
  readonly guidance: string;
}

const guidance = {
  overview: 'Fill Context and Goal first; leave a section empty rather than inventing content.',
  behaviour:
    'Write scenarios before rules; each acceptance scenario must be independently checkable.',
  ux: 'Cover every state of every screen, including empty and error.',
  backend: 'Name the owner of each contract and mark every test as unit or integration.',
  decisions:
    'Add one section block per decision; do not rewrite earlier decisions, supersede them.',
};

export function documentsFor(scenario: EarlyScenario): readonly MockDocument[] {
  const writing = scenario !== 'not-started' && scenario !== 'requirements';
  const doc = (
    id: keyof typeof guidance,
    title: string,
    written: number | undefined,
  ): MockDocument => ({
    id,
    title,
    filename: `${id}.md`,
    state: writing && written !== undefined ? 'written' : 'template',
    ...(writing && written !== undefined ? { updatedMinutesAgo: written } : {}),
    guidance: guidance[id],
  });

  return [
    // The overview's H1 is the Specification title: the row names its type instead.
    doc('overview', 'Overview', 24),
    doc('behaviour', 'Behaviour', 9),
    doc('ux', 'UX', undefined),
    doc('backend', 'Backend', 3),
    doc('decisions', 'Decisions', undefined),
  ];
}

const workflow = {
  workflowId: 'specification-standard',
  version: 1,
  revision: 'rev-specification-standard-1',
  title: 'Standard Specification',
};

const allowed = { kind: 'allowed' } as const;

export function projectionFor(scenario: EarlyScenario): WorkflowActionProjection {
  const subject = { kind: 'specification' as const, specId: specSlug };
  const specification = {
    createTask: allowed,
    taskTypes: [],
    exit: { close: { kind: 'blocked' as const, blockers: [] }, abandon: allowed },
  };

  if (scenario === 'not-started') {
    return {
      subject,
      workflow,
      position: {
        kind: 'not-started',
        preview: {
          ...workflow,
          firstStep: 'requirements',
          firstStepTitle: 'Gather requirements',
          steps: workflowSteps.map((step, index) => ({
            id: step.id,
            title: step.title,
            next: [workflowSteps[index + 1]?.id ?? 'end'],
          })),
        },
        next: {
          step: {
            id: 'requirements',
            title: 'Gather requirements',
            kind: 'work',
            purpose:
              'Agree on the goal, scope, constraints and acceptance with the owner in conversation.',
            executors: ['agent', 'human'],
          },
          human: true,
          agent: { kind: 'available' },
        },
      },
      actions: {
        start: {
          step: 'requirements',
          firstStart: true,
          expectedWorkflowRevision: workflow.revision,
        },
      },
      specification,
    };
  }

  const active = activeSteps[scenario];

  return {
    subject,
    workflow,
    position: {
      kind: 'active',
      step: {
        id: active.id,
        title: active.title,
        kind: 'work',
        purpose: active.purpose,
        executors: ['agent', 'human'],
      },
      attempt: { number: 1, startedAt: minutesAgo(active.since), actor: owner },
    },
    actions: {
      finish: {
        step: active.id,
        attempt: 1,
        transitions: [
          {
            id: active.transition,
            target: { kind: 'step', step: active.next.id },
            feedback: 'optional',
          },
        ],
      },
    },
    specification,
  };
}

/** The active work step of each started scenario (`specification-standard` definitions). */
const activeSteps = {
  requirements: {
    id: 'requirements',
    title: 'Gather requirements',
    purpose: 'Agree on the goal, scope, constraints and acceptance with the owner in conversation.',
    since: 12,
    transition: 'agreed',
    next: { id: 'specification', title: 'Write the Specification' },
  },
  'write-spec': {
    id: 'specification',
    title: 'Write the Specification',
    purpose: 'Write the Specification documents from the agreed requirements.',
    since: 31,
    transition: 'written',
    next: { id: 'solution', title: 'Design the solution' },
  },
  'write-spec-session': {
    id: 'specification',
    title: 'Write the Specification',
    purpose: 'Write the Specification documents from the agreed requirements.',
    since: 31,
    transition: 'written',
    next: { id: 'solution', title: 'Design the solution' },
  },
  'tasks-created': {
    id: 'breakdown',
    title: 'Break the solution down',
    purpose:
      'Draft the Tasks, each with its task type, dependencies and verification; the finish input lists every draft Task.',
    since: 8,
    transition: 'proposed',
    next: { id: 'breakdown-review', title: 'Review the breakdown' },
  },
} as const;

/** What finishing the active step leads to (the projection's transition target, by title). */
export function nextStepTitle(scenario: EarlyScenario): string | undefined {
  return scenario === 'not-started' ? undefined : activeSteps[scenario].next.title;
}

export function sessionsFor(scenario: EarlyScenario): readonly SessionSummary[] {
  if (scenario === 'requirements') {
    return [
      {
        id: 'req',
        title: 'Agree the relevance cutoff requirements',
        navigationStatus: 'quiet',
        taskCount: 0,
        updatedAt: minutesAgo(2),
        providerId: 'claude',
        providerTitle: 'Claude',
        modelId: 'claude-sonnet-5-5',
        modelTitle: 'Sonnet 5.5',
      },
    ];
  }

  if (scenario === 'write-spec-session') {
    return [
      {
        id: 'spec',
        title: 'Write the cutoff Specification documents',
        navigationStatus: 'active',
        taskCount: 0,
        updatedAt: minutesAgo(1),
        providerId: 'claude',
        providerTitle: 'Claude',
        modelId: 'claude-sonnet-5-5',
        modelTitle: 'Sonnet 5.5',
      },
    ];
  }

  return [];
}

/** The overview document as the Secondary preview shows it (front matter not rendered). */
export const overviewMarkdown = `# ${specTitle}

Source: GitHub issue #156.

## Context

Hybrid documentation search has no relevance cutoff. The vector side always returns nearest neighbours, so any query fills the top 10. The nonsense query \`zzzqqq\` returns 10 documents in \`hybrid\` mode and none contains the text. #155 only adds a quiet line saying the results contain none of the searched words. "No matches" and "only proposals match" can never appear while hybrid search is on.

## Goal

${specGoal}

## Non-goals

- Changing the presentation refined in #155.
- Changing lexical ranking or the fusion of word-matched hits.

## Constraints

- The cutoff can hide documents shown today: it needs its own rationale, calibration and tests.
- Calibrated on this repository's corpus with real queries: good ones, partial terms such as \`provid\`, typos, nonsense.
- Tests use small fixtures with fake embeddings.
`;
