import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { WorkflowActionProjection, WorkflowHistory } from '@nevo/specflow-contracts/workflow';
import {
  RoutedSpecificationApp,
  type ControlCenterSource,
} from '../../overview/ControlCenterApp.stories-support';
import {
  controlCenterHistory,
  controlCenterProjection,
  controlCenterTaskList,
  controlCenterWorkspace,
} from '../../overview/controlCenter.stories-support';

/*
 * The shared Feedback view (workflow-execution.md, "Feedback") on the routed Specification Overview:
 * Now's Last hand-off says the outcome, the step, the agent, when, what it committed and "View
 * feedback ›", which opens the one view that presents a feedback whole; the Activity history shows
 * the owner's Confirm or Reject as a line of the attempt it decided. Only the Runtime ports are fakes.
 */

type Variant =
  | 'approved'
  | 'changes-requested'
  | 'no-feedback'
  | 'long'
  | 'rejected'
  | 'returned'
  | 'owner-attempt';

const you = {
  class: 'human' as const,
  details: { actorId: 'runtime:trusted-local', trust: 'local' as const },
};
const REJECTED_AT = '2026-11-14T15:20:00Z';
const RETURNED_AT = '2026-11-14T16:05:00Z';

const longFeedback = [
  'Approved. Attempt 2 resolves all four blocking points and (a)–(d) from attempt 1, checked against source:',
  '',
  '1. `documents-ui-one-client` depends on `create-in-memory-adapter` and removes `DocumentsApi.emulated`.',
  '2. Every specflow-ui importer of `@nevo/specflow-contracts/demo` (20 files) is deleted or retyped by the project Create form or the project Session start.',
  '3. The doc lines named in the transport removal match source (openapi.md:40, code-organization.md:190).',
  '4. The Sessions and Create suites cover every backend.md section 2 row and acceptance criterion 4.',
  '',
  '## Notes for implementers',
  '',
  'None of them blocking:',
  '',
  '- the grep exclusion says docs/adr/, but the ADRs are in docs/architecture/decisions/;',
  '- the tsconfig path alias for the demo entry point also goes;',
  '- `buildDemoSessions` is still used until the transport removal, so move it rather than delete it.',
  '',
  '```ts',
  "export const DEMO_ENTRY = '@nevo/specflow-contracts/demo'; // goes with the transport removal",
  '```',
  '',
  ...Array.from(
    { length: 12 },
    (_, index) =>
      `${String(index + 5)}. Checked task ${String(index + 1)}: its acceptance criteria name the behaviour.md rows they cover, its dependencies are in delivery order and its context lists the documents it reads.`,
  ),
].join('\n');

const rejection =
  'Split T-04: the refresh path and the cookie rotation ship apart.\n\nT-07 needs its rate-limit rows from behaviour.md as acceptance criteria.';

type Attempt = Extract<WorkflowHistory['items'][number], { kind: 'attempt' }>;

/** The approved review behind the hand-off, as `controlCenterHistory` records it. */
function reviewAttempt(): Attempt {
  return controlCenterHistory('waiting').items[0] as Attempt;
}

function withFeedback(feedback: string | undefined) {
  const projection = controlCenterProjection('waiting');
  const handoff = projection.handoff!;
  const review = reviewAttempt();
  const outcome = review.outcome!;
  const { feedback: _omit, ...withoutFeedback } = handoff;
  const { feedback: _was, ...outcomeWithout } = outcome as typeof outcome & { feedback?: string };

  return {
    projection: { ...projection, handoff: feedback ? { ...handoff, feedback } : withoutFeedback },
    items: [{ ...review, outcome: feedback ? { ...outcome, feedback } : outcomeWithout }],
  };
}

/** The ready Breakdown after a return hand-off (`returnedAt`), with the history behind it. */
function returnedTo(
  at: string,
  feedback: string,
  items: WorkflowHistory['items'],
): { projection: WorkflowActionProjection; items: WorkflowHistory['items'] } {
  const ready = controlCenterProjection('changes-requested');

  return { projection: { ...ready, handoff: { kind: 'return', at, feedback } }, items };
}

function sourceOf(variant: Variant): ControlCenterSource {
  const scenario =
    variant === 'approved' || variant === 'long' || variant === 'no-feedback'
      ? 'waiting'
      : 'changes-requested';
  let fixture: { projection: WorkflowActionProjection; items: WorkflowHistory['items'] };
  switch (variant) {
    case 'approved':
    case 'changes-requested':
      fixture = {
        projection: controlCenterProjection(scenario),
        items: controlCenterHistory(scenario).items,
      };
      break;
    case 'no-feedback':
      fixture = withFeedback(undefined);
      break;
    case 'long':
      fixture = withFeedback(longFeedback);
      break;
    case 'rejected': {
      const review = reviewAttempt();
      fixture = returnedTo(REJECTED_AT, rejection, [
        {
          ...review,
          endedAt: '2026-11-14T01:12:00Z',
          confirmation: { state: 'rejected', at: REJECTED_AT, actor: you, feedback: rejection },
        },
      ]);
      break;
    }

    case 'returned':
      fixture = returnedTo(
        RETURNED_AT,
        'The solution misses the token refresh path. Back to Break the solution down: add it as a Task with the expiry case in its acceptance.',
        [
          {
            kind: 'return',
            sequence: 6,
            at: RETURNED_AT,
            to: 'breakdown',
            feedback:
              'The solution misses the token refresh path. Back to Break the solution down: add it as a Task with the expiry case in its acceptance.',
          },
          {
            kind: 'attempt',
            sequence: 5,
            step: 'breakdown',
            stepTitle: 'Break the solution down',
            attempt: 1,
            startedAt: '2026-11-14T13:00:00Z',
            endedAt: '2026-11-14T14:00:00Z',
            actor: you,
            outcome: { kind: 'transition', transition: 'proposed', artifacts: [] },
            transitionLabel: 'Breakdown proposed',
          },
        ],
      );
      break;
    case 'owner-attempt': {
      const projection = controlCenterProjection('waiting');
      const handoff = projection.handoff as Extract<
        NonNullable<WorkflowActionProjection['handoff']>,
        { kind: 'transition' }
      >;
      const feedback =
        'Approved myself after the agent stopped: the twelve Tasks match the roadmap, install and init stay separate.';
      fixture = {
        projection: {
          ...projection,
          handoff: { ...handoff, from: { ...handoff.from, actor: you }, feedback },
        },
        items: [
          {
            kind: 'attempt',
            sequence: 5,
            step: handoff.from.step,
            stepTitle: handoff.from.title,
            attempt: handoff.from.attempt,
            startedAt: '2026-11-14T00:40:00Z',
            endedAt: '2026-11-14T01:12:00Z',
            actor: you,
            outcome: {
              kind: 'transition',
              transition: handoff.transition,
              result: 'pass',
              feedback,
              artifacts: [],
            },
            transitionLabel: 'Breakdown approved',
          },
        ],
      };
      break;
    }
  }

  return {
    workspace: () => controlCenterWorkspace(scenario),
    projection: () => fixture.projection,
    taskList: (query) => controlCenterTaskList(scenario, query),
    history: () => ({
      subject: { kind: 'specification', specId: fixture.projection.subject.specId },
      items: fixture.items,
    }),
  };
}

function FeedbackFixture({ variant }: { readonly variant: Variant }) {
  const source = useMemo(() => sourceOf(variant), [variant]);

  return <RoutedSpecificationApp source={source} />;
}

const meta = {
  title: 'SpecFlow/Screens/Feedback',
  component: FeedbackFixture,
  parameters: { layout: 'fullscreen' },
  args: { variant: 'approved' },
} satisfies Meta<typeof FeedbackFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
const wait = { timeout: 10000 };

async function lastHandoff(canvasElement: HTMLElement) {
  const heading = await within(canvasElement).findByRole(
    'heading',
    { name: 'Last hand-off' },
    wait,
  );

  return heading.closest<HTMLElement>('[data-now-handoff]')!;
}

/** Now's View feedback, then the Feedback view it opens. */
async function openFeedback(canvasElement: HTMLElement) {
  const block = await lastHandoff(canvasElement);
  await userEvent.click(within(block).getByRole('button', { name: 'View feedback' }));

  return waitFor(() => {
    const view = document.body.querySelector<HTMLElement>('[data-feedback-view]');
    if (!view) {
      throw new Error('the Feedback view is not open yet');
    }

    return view;
  }, wait);
}

/** The Feedback view of an approved review: the step, its outcome, the attempt, the agent. */
export const Approved: Story = {
  play: async ({ canvasElement }) => {
    const view = await openFeedback(canvasElement);
    await expect(within(view).getByRole('heading', { name: 'Review the breakdown' })).toBeVisible();
    await expect(within(view).getByText(/^Attempt 1 · /)).toBeVisible();
    await expect(within(view).getByRole('link', { name: 'Open session' })).toBeVisible();
    await expect(
      within(document.body).getByRole('button', { name: 'Copy feedback' }),
    ).toBeVisible();
  },
};

/** Changes requested: the hand-off in the attention tone, its feedback one step away. */
export const ChangesRequested: Story = {
  args: { variant: 'changes-requested' },
  play: async ({ canvasElement }) => {
    const view = await openFeedback(canvasElement);
    await expect(within(view).getByText('Changes requested')).toBeVisible();
  },
};

/** A hand-off that left no feedback: no View feedback at all. */
export const NoFeedback: Story = {
  args: { variant: 'no-feedback' },
  play: async ({ canvasElement }) => {
    const block = await lastHandoff(canvasElement);
    await expect(within(block).getByText('Breakdown approved')).toBeVisible();
    await expect(within(block).queryByRole('button', { name: 'View feedback' })).toBeNull();
  },
};

/** Very long Markdown: Now stays the same size; the Feedback view scrolls it whole. */
export const LongFeedback: Story = {
  args: { variant: 'long' },
  play: async ({ canvasElement }) => {
    const block = await lastHandoff(canvasElement);
    await expect(within(block).queryByText(/Notes for implementers/)).toBeNull();
    const view = await openFeedback(canvasElement);
    await expect(
      within(view).getByRole('heading', { name: 'Notes for implementers' }),
    ).toBeInTheDocument();
    await expect(within(view).getByText(/Checked task 12/)).toBeInTheDocument();
  },
};

/**
 * The owner rejected the agent's result: Now's hand-off is the return with the owner's feedback;
 * the Feedback view shows the attempt with "Rejected by you" and both feedbacks, each labelled.
 */
export const Rejected: Story = {
  args: { variant: 'rejected' },
  play: async ({ canvasElement }) => {
    const view = await openFeedback(canvasElement);
    await expect(within(view).getByText(/^Rejected by you · /)).toBeVisible();
    await expect(
      within(view).getByRole('heading', { name: 'Why the result was rejected' }),
    ).toBeVisible();
    await expect(within(view).getByText(/Split T-04/)).toBeVisible();
  },
};

/** A return the owner made between attempts: no attempt and no agent, the step it went back to. */
export const Returned: Story = {
  args: { variant: 'returned' },
  play: async ({ canvasElement }) => {
    const view = await openFeedback(canvasElement);
    await expect(
      within(view).getByRole('heading', { name: 'Break the solution down' }),
    ).toBeVisible();
    await expect(within(view).getByText('Returned to this step')).toBeVisible();
    await expect(within(view).queryByRole('link', { name: 'Open session' })).toBeNull();
  },
};

/** The owner's own attempt: no agent line, "you" in the attempt line. */
export const OwnerAttempt: Story = {
  args: { variant: 'owner-attempt' },
  play: async ({ canvasElement }) => {
    const view = await openFeedback(canvasElement);
    await expect(within(view).getByText(/^Attempt 1 · .+ · you$/)).toBeVisible();
    await expect(within(view).queryByRole('link', { name: 'Open session' })).toBeNull();
  },
};

/** Now as the owner first sees it, for rendered review: no play. */
const now = (variant: Variant): Story => ({ tags: ['capture'], args: { variant } });
export const ApprovedNow = now('approved');
export const ChangesRequestedNow = now('changes-requested');
export const LongFeedbackNow = now('long');
export const RejectedNow = now('rejected');
export const ReturnedNow = now('returned');

/** The Activity history beside Overview, or its stacked screen on a phone. */
async function openHistory(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await lastHandoff(canvasElement);
  const opened = await canvas
    .findByRole('complementary', { name: 'Activity history' }, { timeout: 3000 })
    .catch(() => undefined);
  if (!opened) {
    const direct = canvas.queryByRole('button', { name: 'Activity history' });
    if (direct) {
      await userEvent.click(direct);
    } else {
      await userEvent.click(canvas.getAllByRole('button', { name: 'More actions' })[0]!);
      await userEvent.click(
        await within(document.body).findByRole('menuitem', { name: 'Activity history' }),
      );
    }
  }

  const aside = await canvas.findByRole('complementary', { name: 'Activity history' }, wait);
  await waitFor(() => expect(aside.querySelector('[data-attempt-entry]')).not.toBeNull(), wait);

  return aside;
}

/**
 * The rejected attempt in the Activity history: one entry with the agent's result and the owner's
 * "Rejected by you" line, and View feedback, never the feedback in place.
 */
export const RejectedHistory: Story = {
  args: { variant: 'rejected' },
  play: async ({ canvasElement }) => {
    const history = within(await openHistory(canvasElement));
    await expect(history.getByText(/^Rejected by you · /)).toBeVisible();
    await expect(history.queryByText(/Split T-04/)).toBeNull();
    await expect(history.getByRole('button', { name: 'View feedback' })).toBeVisible();
  },
};

/** View feedback from the history opens the same Feedback view, pushed onto the history. */
export const FromHistory: Story = {
  args: { variant: 'rejected' },
  play: async ({ canvasElement }) => {
    const history = within(await openHistory(canvasElement));
    await userEvent.click(history.getByRole('button', { name: 'View feedback' }));
    const view = await waitFor(() => {
      const found = document.body.querySelector<HTMLElement>('[data-feedback-view]');
      if (!found) {
        throw new Error('the Feedback view is not open yet');
      }

      return found;
    }, wait);
    await expect(within(view).getByText(/Split T-04/)).toBeVisible();
  },
};
