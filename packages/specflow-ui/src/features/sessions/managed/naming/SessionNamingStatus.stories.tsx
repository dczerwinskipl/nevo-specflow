import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { settleViewport } from '../../../../test-support/viewportSettle.stories-support';
import { Environment, NARROW_VIEWPORT } from '../managedSession.storyHelpers.stories-support';
import { SessionLandingPreview } from './sessionLanding.stories-support';

/**
 * The Session header right after a Session started from the New Session screen: a provisional
 * title with "Nadawanie nazwy…" while the agent names it, then the generated name. A Session
 * started with the user's own name shows that name at once, with no naming state.
 */
const meta = {
  title: 'SpecFlow/Screens/Session Naming',
  component: SessionLandingPreview,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Environment>
        <Story />
      </Environment>
    ),
  ],
  args: {
    firstMessage:
      'Przejrzyj kryteria akceptacji logowania SSO i wskaż luki w scenariuszach błędów.',
    generatedTitle: 'Luki w kryteriach logowania SSO',
  },
} satisfies Meta<typeof SessionLandingPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

const heading = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('heading', { level: 1 });

export const NamingPending: Story = {
  args: { namingDelayMs: null },
  play: async ({ canvasElement }) => {
    await settleViewport();
    await expect(heading(canvasElement)).toHaveTextContent('Nowa sesja');
    await expect(within(canvasElement).getByText('Nadawanie nazwy…')).toBeVisible();
  },
};

export const NamingPendingMobile: Story = {
  ...NamingPending,
  globals: NARROW_VIEWPORT,
  play: async ({ canvasElement }) => {
    await settleViewport(375, 812);
    const status = within(canvasElement).getByText('Nadawanie nazwy…');
    await expect(status).toBeVisible();
    // The naming state never pushes the header's Context action out of a 375px header.
    const header =
      canvasElement.querySelector<HTMLElement>('[data-workspace-header]') ?? canvasElement;
    const context = within(header).getByRole('button', { name: 'Kontekst' });
    await expect(context.getBoundingClientRect().right).toBeLessThanOrEqual(375);
    await expect(status.getBoundingClientRect().right).toBeLessThanOrEqual(
      context.getBoundingClientRect().left,
    );
  },
};

export const NamedByAgent: Story = {
  args: { namingDelayMs: 300 },
  play: async ({ canvasElement, args }) => {
    await expect(heading(canvasElement)).toHaveTextContent('Nowa sesja');
    await expect(
      await within(canvasElement).findByRole('heading', { level: 1, name: args.generatedTitle }),
    ).toBeVisible();
    await expect(within(canvasElement).queryByText('Nadawanie nazwy…')).not.toBeInTheDocument();
  },
};

export const OwnNameNoNaming: Story = {
  args: { customName: 'Przegląd SSO — błędy' },
  play: async ({ canvasElement }) => {
    await expect(heading(canvasElement)).toHaveTextContent('Przegląd SSO — błędy');
    await expect(within(canvasElement).queryByText('Nadawanie nazwy…')).not.toBeInTheDocument();
  },
};
