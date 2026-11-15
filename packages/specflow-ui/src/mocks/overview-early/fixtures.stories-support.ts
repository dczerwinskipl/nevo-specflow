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
  | 'write-spec-session';

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
  const writing = scenario === 'write-spec' || scenario === 'write-spec-session';
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

  const requirements = scenario === 'requirements';

  return {
    subject,
    workflow,
    position: {
      kind: 'active',
      step: requirements
        ? {
            id: 'requirements',
            title: 'Gather requirements',
            kind: 'work',
            purpose:
              'Agree on the goal, scope, constraints and acceptance with the owner in conversation.',
            executors: ['agent', 'human'],
          }
        : {
            id: 'specification',
            title: 'Write the Specification',
            kind: 'work',
            purpose: 'Write the Specification documents from the agreed requirements.',
            executors: ['agent', 'human'],
          },
      attempt: { number: 1, startedAt: minutesAgo(requirements ? 12 : 31), actor: owner },
    },
    actions: {
      finish: {
        step: requirements ? 'requirements' : 'specification',
        attempt: 1,
        transitions: [
          {
            id: requirements ? 'agreed' : 'written',
            ...(requirements ? { label: 'Requirements agreed' } : {}),
            target: { kind: 'step', step: requirements ? 'specification' : 'solution' },
            feedback: 'optional',
          },
        ],
      },
    },
    specification,
  };
}

/** What finishing the active step leads to (the projection's transition target, by title). */
export function nextStepTitle(scenario: EarlyScenario): string | undefined {
  if (scenario === 'requirements') {
    return 'Write the Specification';
  }

  return scenario === 'not-started' ? undefined : 'Design the solution';
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
