import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { settleViewport } from '../../../../test-support/viewportSettle.stories-support';
import { Environment, NARROW_VIEWPORT } from '../managedSession.storyHelpers.stories-support';
import { SessionLandingPreview } from './sessionLanding.stories-support';

/**
 * The Session header after a Session started from the New Session screen: idle with the provisional
 * title and an empty Composer; once the first message is sent in it, "Nadawanie nazwy…" while the
 * agent names it, then the generated name. A Session started with the user's own name shows that
 * name at once, with no naming state.
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
    sentMessage: 'Przejrzyj kryteria akceptacji logowania SSO i wskaż luki w scenariuszach błędów.',
    generatedTitle: 'Luki w kryteriach logowania SSO',
  },
} satisfies Meta<typeof SessionLandingPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

const heading = (canvasElement: HTMLElement) =>
  within(canvasElement).getByRole('heading', { level: 1 });

export const IdleBeforeFirstMessage: Story = {
  args: { sentMessage: undefined },
  play: async ({ canvasElement }) => {
    await settleViewport();
    await expect(heading(canvasElement)).toHaveTextContent('Nowa sesja');
    await expect(within(canvasElement).queryByText('Nadawanie nazwy…')).not.toBeInTheDocument();
    await expect(within(canvasElement).getByRole('textbox', { name: 'Wiadomość' })).toHaveValue('');
  },
};

/** The first message sent in the Session starts the naming: pending, then the generated name. */
export const NamingStartsAfterFirstMessage: Story = {
  args: { sentMessage: undefined, namingDelayMs: 400 },
  play: async ({ canvasElement, args, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Wiadomość' }),
      'Sprawdź kryteria SSO',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Wyślij' }));
    await expect(await canvas.findByText('Nadawanie nazwy…')).toBeVisible();
    await expect(heading(canvasElement)).toHaveTextContent('Nowa sesja');
    await expect(
      await canvas.findByRole('heading', { level: 1, name: args.generatedTitle }),
    ).toBeVisible();
    await expect(canvas.queryByText('Nadawanie nazwy…')).not.toBeInTheDocument();
  },
};

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
