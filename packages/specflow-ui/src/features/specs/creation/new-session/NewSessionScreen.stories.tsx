import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { withLocale } from '../../../../i18n/StoryLocalization';
import { settleViewport } from '../../../../test-support/viewportSettle.stories-support';
import { catalogue } from '../options/creationCatalogue.stories-support';
import {
  allocations,
  generatedSessionTitle,
  NewSessionFixture,
  starts,
} from './newSession.stories-support';

/**
 * New Session of an existing Specification (`/specs/$specId/sessions/new`, demo Runtime): the
 * pinned Specification, the agent, the first message in the Session Composer, the optional own
 * name and the read-only workspace. UX contract: `docs/ideas/specflow-ui/screens/new-session-ui-spec.md`.
 */
const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Screens/New Session',
  component: NewSessionFixture,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof NewSessionFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

const body = () => within(document.body);
const firstMessage =
  'Przejrzyj kryteria akceptacji logowania SSO i wskaż luki w scenariuszach błędów.';
const startButton = (canvas: StoryContext['canvas']) =>
  canvas.getByRole('button', { name: 'Rozpocznij sesję' });

async function chooseModel(canvas: StoryContext['canvas'], name: string) {
  await userEvent.click(canvas.getByRole('button', { name: 'Wybierz model' }));
  await userEvent.click(await body().findByRole('menuitemradio', { name }));
  // A model with efforts keeps the menu open for the effort section: close it.
  if (body().queryByRole('menu')) {
    await userEvent.keyboard('{Escape}');
  }

  await waitFor(() => expect(body().queryByRole('menu')).toBeNull());
}

async function expectNoHorizontalScroll() {
  await waitFor(() =>
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth),
  );
}

/** Scenario (a)+(b)+(c): the agent names the Session; the header shows the naming, then the name. */
export const AgentNamesSession: Story = {
  play: async ({ canvas, userEvent }) => {
    await settleViewport();
    await expect(
      await canvas.findByRole('heading', { level: 1, name: 'Nowa sesja' }),
    ).toBeVisible();
    // (a) The Specification is the pinned, read-only context; the workspace is read-only too.
    await expect(await canvas.findByText('Logowanie SSO')).toBeVisible();
    await expect(canvas.getByText('Przypięta')).toBeVisible();
    await expect(canvas.getByText(/\/demo\/project · main/)).toBeVisible();
    await expect(canvas.queryByRole('radio', { name: 'Nowe środowisko pracy' })).toBeNull();
    // (c) The default is legible before sending: the agent names the Session, no name field.
    await expect(
      canvas.getByText('Agent nada sesji nazwę na podstawie Twojej pierwszej wiadomości.'),
    ).toBeVisible();
    await expect(canvas.queryByRole('textbox', { name: 'Nazwa sesji' })).toBeNull();
    // (b) Agent, then the first message with the first Turn's mode and model in its toolbar.
    await expect(canvas.getByRole('radio', { name: /Codex/ })).toBeChecked();
    await expect(startButton(canvas)).toBeDisabled();
    await expect(canvas.getByText('Wybierz model.')).toBeVisible();
    await chooseModel(canvas, 'codex model A');
    await expect(canvas.getByRole('button', { name: 'Agent' })).toBeVisible();
    await expect(canvas.getByText('Napisz pierwszą wiadomość.')).toBeVisible();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Pierwsza wiadomość' }), firstMessage);
    await expect(
      canvas.getByText('Sesja otworzy się z tą wiadomością, a agent nada jej nazwę.'),
    ).toBeVisible();
    await userEvent.click(startButton(canvas));
    await waitFor(() =>
      expect(allocations).toEqual([
        expect.objectContaining({ providerId: 'codex', modelId: 'model-a', mode: 'agent' }),
      ]),
    );
    await expect(allocations[0]).not.toHaveProperty('effort');
    await expect(starts).toEqual([{ firstMessage, name: undefined }]);
    // The Session screen: provisional title while the agent names it, then the generated name.
    await expect(await canvas.findByText('Nadawanie nazwy…')).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Nowa sesja');
    await expect(
      await canvas.findByRole('heading', { level: 1, name: generatedSessionTitle }),
    ).toBeVisible();
    await expect(canvas.queryByText('Nadawanie nazwy…')).toBeNull();
  },
};

export const AgentNamesSessionMobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await settleViewport(375, 812);
    await canvas.findByText('Logowanie SSO');
    await expectNoHorizontalScroll();
    await chooseModel(canvas, 'codex model A');
    const editor = canvas.getByRole('textbox', { name: 'Pierwsza wiadomość' });
    // Touch layout: Enter adds a line, it never starts the Session.
    await userEvent.type(editor, 'Pierwsza linia{Enter}druga linia');
    await expect(editor).toHaveValue('Pierwsza linia\ndruga linia');
    await expect(allocations).toHaveLength(0);
    // Mode and model stay on one toolbar row inside the Composer at 375px.
    const mode = canvas.getByRole('button', { name: 'Agent' });
    const model = canvas.getByRole('button', { name: /codex model A/ });
    await expect(
      Math.abs(mode.getBoundingClientRect().top - model.getBoundingClientRect().top),
    ).toBeLessThan(4);
    await expect(model.getBoundingClientRect().right).toBeLessThanOrEqual(375);
    await expectNoHorizontalScroll();
    await userEvent.click(startButton(canvas));
    await expect(await canvas.findByText('Nadawanie nazwy…')).toBeVisible();
    await expectNoHorizontalScroll();
  },
};

/** Scenario (c) alternative: an own name, switching back keeps the text but the agent names it. */
export const OwnName: Story = {
  play: async ({ canvas, userEvent }) => {
    await settleViewport();
    await canvas.findByText('Logowanie SSO');
    await chooseModel(canvas, 'codex model A');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Pierwsza wiadomość' }), firstMessage);
    await userEvent.click(canvas.getByRole('button', { name: 'Nadaj własną nazwę' }));
    const field = canvas.getByRole('textbox', { name: 'Nazwa sesji' });
    await waitFor(() => expect(field).toHaveFocus());
    await expect(field).toHaveAttribute('maxlength', '256');
    await expect(canvas.getByText('Do 256 znaków.')).toBeVisible();
    // A chosen own name must not be blank.
    await expect(startButton(canvas)).toBeDisabled();
    await expect(canvas.getByText('Wpisz nazwę albo pozwól agentowi ją nadać.')).toBeVisible();
    await userEvent.type(field, 'Przegląd SSO — błędy');
    await expect(canvas.getByText('Sesja otworzy się z tą wiadomością.')).toBeVisible();
    // Switching back hides the field (focus returns to "own name") and keeps the text.
    await userEvent.click(canvas.getByRole('button', { name: 'Niech nazwę nada agent' }));
    await expect(canvas.queryByRole('textbox', { name: 'Nazwa sesji' })).toBeNull();
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Nadaj własną nazwę' })).toHaveFocus(),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Nadaj własną nazwę' }));
    await expect(canvas.getByRole('textbox', { name: 'Nazwa sesji' })).toHaveValue(
      'Przegląd SSO — błędy',
    );
    await userEvent.click(startButton(canvas));
    await waitFor(() => expect(starts).toEqual([{ firstMessage, name: 'Przegląd SSO — błędy' }]));
    // An own name is shown at once: no naming state.
    await expect(
      await canvas.findByRole('heading', { level: 1, name: 'Przegląd SSO — błędy' }),
    ).toBeVisible();
    await expect(canvas.queryByText('Nadawanie nazwy…')).toBeNull();
  },
};

export const OwnNameMobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await settleViewport(375, 812);
    await canvas.findByText('Logowanie SSO');
    await userEvent.click(canvas.getByRole('button', { name: 'Nadaj własną nazwę' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Nazwa sesji' }), 'x'.repeat(240));
    await expect(canvas.getByText('Pozostało znaków: 16.')).toBeVisible();
    await expectNoHorizontalScroll();
  },
};

/** Scenario (b): an explicit effort and work mode reach the allocation; no effort = provider default. */
export const EffortAndMode: Story = {
  play: async ({ canvas, userEvent }) => {
    await settleViewport();
    await canvas.findByText('Logowanie SSO');
    await userEvent.click(canvas.getByRole('button', { name: 'Wybierz model' }));
    await userEvent.click(await body().findByRole('menuitemradio', { name: 'codex model A' }));
    // The effort section opens with the provider default chosen.
    await expect(
      await body().findByRole('menuitemradio', { name: 'Domyślny wykonawcy' }),
    ).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(body().getByRole('menuitemradio', { name: 'high' }));
    // While a menu is open the rest of the page is hidden from assistive technology.
    await waitFor(() => expect(body().queryByRole('menu')).toBeNull());
    await expect(canvas.getByRole('button', { name: /^codex model A\s?· high$/ })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Agent' }));
    await expect(body().queryByRole('menuitemradio', { name: /^Plan/ })).toBeNull();
    await userEvent.click(await body().findByRole('menuitemradio', { name: 'Ask' }));
    await waitFor(() => expect(body().queryByRole('menu')).toBeNull());
    await userEvent.type(canvas.getByRole('textbox', { name: 'Pierwsza wiadomość' }), firstMessage);
    // Enter on a desktop keyboard starts the Session like the button.
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(allocations).toEqual([
        expect.objectContaining({ modelId: 'model-a', effort: 'high', mode: 'ask' }),
      ]),
    );
  },
};

/** Scenario (e): no agent is ready — the reason is stated, nothing can start. */
export const NoProviderReady: Story = {
  args: {
    catalogue: {
      ...catalogue,
      providers: catalogue.providers.map((provider) => ({
        ...provider,
        available: false,
        reason: 'Nie zalogowano do CLI.',
      })),
    },
  },
  play: async ({ canvas }) => {
    await settleViewport();
    await canvas.findByText('Logowanie SSO');
    await expect(canvas.getByText('Żaden wykonawca nie jest teraz dostępny.')).toBeVisible();
    await expect(canvas.getByRole('radio', { name: /Codex/ })).toBeDisabled();
    await expect(canvas.getAllByText('Nie zalogowano do CLI.')).toHaveLength(2);
    await expect(startButton(canvas)).toBeDisabled();
  },
};

export const NoProviderReadyMobile: Story = {
  ...NoProviderReady,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas }) => {
    await settleViewport(375, 812);
    await canvas.findByText('Logowanie SSO');
    await expect(canvas.getByText('Żaden wykonawca nie jest teraz dostępny.')).toBeVisible();
    await expectNoHorizontalScroll();
  },
};

/** Scenario (e): a blank message cannot start the Session, by button or by Enter. */
export const EmptyMessage: Story = {
  play: async ({ canvas, userEvent }) => {
    await settleViewport();
    await canvas.findByText('Logowanie SSO');
    await chooseModel(canvas, 'codex model A');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Pierwsza wiadomość' }), '   ');
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByText('Napisz pierwszą wiadomość.')).toBeVisible();
    await expect(startButton(canvas)).toBeDisabled();
    await expect(allocations).toHaveLength(0);
  },
};

/** Scenario (e): the allocation fails — the form, message and choices stay; the reason is shown. */
export const StartFailed: Story = {
  args: { allocation: 'failed' },
  play: async ({ canvas, userEvent }) => {
    await settleViewport();
    await canvas.findByText('Logowanie SSO');
    await chooseModel(canvas, 'codex model A');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Pierwsza wiadomość' }), firstMessage);
    await userEvent.click(startButton(canvas));
    await expect(await canvas.findByRole('alert')).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Pierwsza wiadomość' })).toHaveValue(
      firstMessage,
    );
    await expect(canvas.queryByText('Nadawanie nazwy…')).toBeNull();
  },
};
