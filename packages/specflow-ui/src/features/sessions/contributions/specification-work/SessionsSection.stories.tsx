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

/** The mark is centred on the row content (title, facts and any status line). */
async function expectMarkCentred(root: HTMLElement) {
  const row = root.querySelector('li')!;
  const mark = row.firstElementChild!.firstElementChild!.firstElementChild!.getBoundingClientRect();
  const content = row.querySelector('[data-spec-title]')!.parentElement!.getBoundingClientRect();
  const centre = (box: DOMRect) => box.top + box.height / 2;
  await expect(Math.abs(centre(mark) - centre(content))).toBeLessThanOrEqual(1);
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
    // Wide: the status is the last inline item, on the facts' line box.
    const age = canvasElement.querySelector('[data-inline-fact]')!.getBoundingClientRect();
    const status = canvasElement.querySelector('[data-inline-status]')!.getBoundingClientRect();
    await expect(Math.abs(status.top - age.top)).toBeLessThanOrEqual(0.5);
    await expectMarkCentred(canvasElement);
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

export const ContinueSessionRowMobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement, canvas }) => {
    await canvas.findByRole('button', { name: 'Przegląd logowania SSO i odświeżania tokenów' });
    const facts = [...canvasElement.querySelectorAll('[data-inline-fact]')];
    const status = canvasElement.querySelector('[data-inline-status]')!.getBoundingClientRect();
    await expect(status.top).toBeGreaterThanOrEqual(
      facts.at(-1)!.getBoundingClientRect().bottom - 0.5,
    );
    await expectMarkCentred(canvasElement);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
