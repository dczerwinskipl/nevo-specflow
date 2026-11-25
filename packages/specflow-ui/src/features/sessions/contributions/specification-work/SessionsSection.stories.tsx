import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { withLocale } from '../../../../i18n/StoryLocalization';
import type { SessionSummary } from '../../../specs/read-model';
import { SessionsSection } from './SessionsSection';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/** A workspace Session row as the read model maps it (Claude, requires attention, 3 Tasks). */
const attention: SessionSummary = {
  id: 'sso',
  title: 'Przegląd logowania SSO i odświeżania tokenów',
  navigationStatus: 'attention',
  activityCode: 'attention',
  activity: { label: '', tone: 'attention', icon: 'triangle-alert' },
  taskCount: 3,
  updatedAt: minutesAgo(5),
  providerId: 'claude',
  providerTitle: 'Claude',
  modelId: 'claude-opus-4-1',
  modelTitle: 'Opus 4.1',
};

/** The visible text of each inline fact, without separators or assistive text. */
function factTexts(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>('[data-inline-fact]')].map(
    (fact) =>
      (fact.lastElementChild!.querySelector('[aria-hidden="true"]') ?? fact.lastElementChild!)
        .textContent,
  );
}

/** The mark is on the title line, at the top of the row however many lines it wraps to. */
async function expectMarkOnTitleLine(root: HTMLElement) {
  const row = root.querySelector('li')!;
  const mark = row.firstElementChild!.firstElementChild!.firstElementChild!.getBoundingClientRect();
  const title = row.querySelector('[data-spec-title]')!.getBoundingClientRect();
  const centre = (box: DOMRect) => box.top + box.height / 2;
  // The title's first line is 20 px high; a wrapped title only grows below it.
  await expect(Math.abs(centre(mark) - (title.top + 10))).toBeLessThanOrEqual(1.5);
}

/**
 * Continue session (specification-sessions.md "The same row elsewhere"): the same row as the
 * Session's row in the Specification Sessions list, with the provider mark, age · agent · Tasks and
 * the effective status.
 */
const meta = {
  title: 'SpecFlow/Screens/Specification Workspace',
  component: SessionsSection,
  decorators: [withLocale('pl')],
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
  args: {
    sessions: [attention],
    onOpenSession: fn(),
    onOpenSessionsView: fn(),
    onStartSession: fn(),
    canStartSession: true,
    canOpenSession: true,
  },
  render: (args) => (
    <div className="max-w-content-standard p-6">
      <SessionsSection {...args} />
    </div>
  ),
} satisfies Meta<typeof SessionsSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ContinueSessionRow: Story = {
  play: async ({ canvasElement, canvas }) => {
    await expect(
      await canvas.findByRole('button', { name: 'Przegląd logowania SSO i odświeżania tokenów' }),
    ).toBeVisible();
    await expect(factTexts(canvasElement)).toEqual(['5 minut temu', 'Opus 4.1', '3 zadania']);
    await expect(canvas.getByText('Claude, model Opus 4.1')).toBeInTheDocument();
    await expect(canvas.getByText('Wymaga uwagi')).toBeVisible();
    // New session is visible beside the rows, like the Tasks section's New task.
    await expect(canvas.getByRole('button', { name: 'Nowa sesja' })).toBeVisible();
    // Wide: the status is the last inline item, on the facts' line box.
    const age = canvasElement.querySelector('[data-inline-fact]')!.getBoundingClientRect();
    const status = canvasElement.querySelector('[data-inline-status]')!.getBoundingClientRect();
    await expect(Math.abs(status.top - age.top)).toBeLessThanOrEqual(0.5);
    await expectMarkOnTitleLine(canvasElement);
  },
};

/** A provider sign-in: named and muted, the same as the list row. */
export const ContinueSessionSignInRequired: Story = {
  args: {
    sessions: [
      {
        ...attention,
        navigationStatus: 'authenticationRequired',
        activityCode: undefined,
        activity: undefined,
        taskCount: 0,
      },
    ],
  },
  play: async ({ canvasElement, canvas }) => {
    const status = await canvas.findByText('Claude: wymagane ponowne logowanie');
    await expect(status.closest('.text-content-muted')).not.toBeNull();
    await expect(factTexts(canvasElement)).toEqual(['5 minut temu', 'Opus 4.1']);
  },
};

/** A provider SpecFlow has not confirmed: says so and that opening the Session checks it. */
export const ContinueSessionUnconfirmedProvider: Story = {
  args: {
    sessions: [
      {
        ...attention,
        navigationStatus: 'unknown',
        activityCode: undefined,
        activity: undefined,
        taskCount: 0,
      },
    ],
  },
  play: async ({ canvas }) => {
    const status = await canvas.findByText(
      'SpecFlow nie potwierdził, że Claude może ją prowadzić; otwórz sesję, aby to sprawdzić',
    );
    await expect(status.closest('.text-content-muted')).not.toBeNull();
  },
};

export const ContinueSessionRowMobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement, canvas }) => {
    await canvas.findByRole('button', { name: 'Przegląd logowania SSO i odświeżania tokenów' });
    const facts = [...canvasElement.querySelectorAll('[data-inline-fact]')];
    const status = canvasElement.querySelector('[data-inline-status]')!.getBoundingClientRect();
    await expect(status.top).toBeGreaterThanOrEqual(
      facts.at(-1)!.getBoundingClientRect().bottom - 0.5,
    );
    await expectMarkOnTitleLine(canvasElement);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

/**
 * Agent step Sessions by their step, with the Task for a Task's step, and "Attempt n · model · age"
 * under it (the Runtime's `agentStep`; dogfood #189: every one read "Agent step execution"). A
 * long title wraps under its mark on a phone, never widening the page; a title the owner gave a
 * Session stays.
 */
export const AgentStepSessionTitlesMobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  args: {
    sessions: [
      {
        ...attention,
        id: 'review-1',
        title: 'Review the breakdown · attempt 1',
        agentStep: { stepId: 'review-breakdown', stepTitle: 'Review the breakdown', attempt: 1 },
        navigationStatus: 'quiet',
        activityCode: undefined,
        activity: undefined,
        taskCount: 0,
      },
      {
        ...attention,
        id: 'breakdown-2',
        title: 'Agent step execution',
        agentStep: { stepId: 'breakdown', stepTitle: 'Break down the solution', attempt: 2 },
        navigationStatus: 'quiet',
        activityCode: undefined,
        activity: undefined,
        taskCount: 0,
      },
      {
        ...attention,
        id: 'implement-1',
        title: 'Implementation · attempt 1 · First step per archetype in the archetype catalogue',
        agentStep: {
          stepId: 'implement',
          stepTitle: 'Implementation',
          attempt: 1,
          taskId: 'T-03',
          taskTitle: 'First step per archetype in the archetype catalogue',
        },
        navigationStatus: 'quiet',
        activityCode: undefined,
        activity: undefined,
        taskCount: 1,
      },
    ],
  },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole('button', { name: 'Review the breakdown' });
    await expect(canvas.getByRole('button', { name: 'Break down the solution' })).toBeVisible();
    await expect(
      canvas.getByRole('button', {
        name: 'Implementation · First step per archetype in the archetype catalogue',
      }),
    ).toBeVisible();
    // The attempt leads the facts line, then the model and the age.
    const rows = [...canvasElement.querySelectorAll('[data-focus-key^="session:"]')];
    // This story reads in Polish: "Próba 1 · Opus 4.1 · 5 minut temu".
    await expect(rows.map((row) => row.textContent)).toEqual([
      'Review the breakdown·Próba 1·Opus 4.1Claude, model Opus 4.1·5 minut temu',
      'Break down the solution·Próba 2·Opus 4.1Claude, model Opus 4.1·5 minut temu',
      'Implementation · First step per archetype in the archetype catalogue·Próba 1·Opus 4.1Claude, model Opus 4.1·5 minut temu',
    ]);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
