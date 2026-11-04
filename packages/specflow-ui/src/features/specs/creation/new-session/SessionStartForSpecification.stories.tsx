import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { withLocale } from '../../../../i18n/StoryLocalization';
import { browserPage } from '../../../../test-support/browserPage';
import { settleViewport } from '../../../../test-support/viewportSettle.stories-support';
import { noProviderCatalogue } from './demoStartCatalogue.stories-support';
import {
  allocations,
  DemoStartedPreview,
  DemoStartPreview,
  turns,
} from './demoStart.stories-support';

/**
 * Starting a new Session on a Specification inside the Session screen itself
 * (`docs/ideas/specflow-ui/screens/new-session-ui-spec.md`): the full shell at once, the pinned
 * Specification in Context, the start form in the conversation column and the Composer visible but
 * inactive until Start. The real demo start source runs over a mocked allocation (the shared Create
 * operation); a started Session opens as in the route. Every state is rendered from the story's
 * args, so it is visible in the plain Storybook UI; the plays only assert it and walk the flow.
 * Starting without a Specification is `Session Start`'s managed stories.
 */
const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Screens/Session Start',
  component: DemoStartPreview,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DemoStartPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
type Canvas = StoryContext['canvas'];

export const Default: Story = {
  tags: ['!contract'],
  argTypes: {
    allocation: { control: 'inline-radio', options: ['ok', 'failed', 'unknown', 'never'] },
  },
};

const mobile = { viewport: { value: 'mobile1', isRotated: false } };
const body = () => within(document.body);
const startButton = (canvas: Canvas) =>
  canvas.getByRole('button', { name: /^(Rozpocznij sesję|Rozpoczynanie…)$/ });
/** The text is shown in the Context panel (the executor row), not only in the form's field. */
const inContext = (canvas: Canvas, text: string) =>
  canvas
    .getAllByText(text)
    .some((element) => element.closest('[data-workspace-surface="secondary"]') !== null);
const composer = (canvas: Canvas) => canvas.getByRole('textbox', { name: 'Wiadomość' });
const provider = (canvas: Canvas, name: RegExp) => canvas.getByRole('radio', { name });
const firstMessage =
  'Przejrzyj kryteria akceptacji logowania SSO i wskaż luki w scenariuszach błędów.';

/**
 * Sizes the viewport and waits for the layout inside the test runner; in the plain Storybook UI
 * there is no Browser Mode, the viewport comes from the toolbar and nothing needs settling. The
 * states themselves never depend on this: they are rendered from the story's args.
 */
async function settle(width?: number, height?: number) {
  try {
    await browserPage();
  } catch {
    return;
  }

  await settleViewport(width, height);
}

async function expectNoHorizontalScroll() {
  await waitFor(() =>
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth),
  );
}

/**
 * The form's action row is reachable and never covered by the Composer: scrolled to the end of the
 * conversation, the Start button ends above the docked Composer.
 */
async function expectActionRowClear(canvas: Canvas) {
  // Scroll every scrollable ancestor of the button to its end, and put them back afterwards so the
  // story stays at the top for whoever looks at it.
  const scrolled: { node: HTMLElement; top: number }[] = [];
  for (let node = startButton(canvas).parentElement; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight) {
      scrolled.push({ node, top: node.scrollTop });
      node.scrollTop = node.scrollHeight;
    }
  }

  try {
    await waitFor(async () => {
      // Without a docked Composer (narrow, before Start) the limit is the viewport itself.
      const limit =
        document.querySelector('[data-composer-overlay]')?.getBoundingClientRect().top ??
        window.innerHeight;
      await expect(startButton(canvas).getBoundingClientRect().bottom).toBeLessThanOrEqual(
        limit + 1,
      );
    });
  } finally {
    for (const { node, top } of scrolled) {
      node.scrollTop = top;
    }
  }
}

/** Picks an option of a picker field, whichever control (Select or Combobox) it is. */
async function pick(canvas: Canvas, field: string, option: string | RegExp) {
  await userEvent.click(await canvas.findByRole('combobox', { name: field }));
  await userEvent.click(await body().findByRole('option', { name: option }));
  await waitFor(() => expect(body().queryByRole('listbox')).toBeNull());
}

const claudeModelA = {
  defaults: {
    agent: {
      providerId: 'claude',
      modelId: 'model-a',
      effort: 'provider-default',
      mode: 'acceptEdits',
    },
  },
} as const;

/** Scenario (a): nothing chosen but the provider; the shell is there, only the form is active. */
export const Open: Story = {
  play: async ({ canvas }) => {
    await settle();
    await expect(canvas.getByRole('heading', { level: 1, name: 'Nowa sesja' })).toBeVisible();
    await expect(
      await canvas.findByRole('heading', { level: 2, name: 'Rozpocznij sesję' }),
    ).toBeVisible();
    // The three field rows exist before a model is chosen; Effort and Work mode wait for it.
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toBeEnabled();
    await expect(canvas.getByRole('combobox', { name: 'Effort' })).toBeDisabled();
    await expect(canvas.getByRole('combobox', { name: 'Effort' })).toHaveTextContent('Domyślny');
    const modes = canvas.getByRole('radiogroup', { name: 'Tryb pracy' });
    await expect(modes).toBeVisible();
    for (const mode of within(modes).getAllByRole('radio')) {
      await expect(mode).toBeDisabled();
    }

    await expect(startButton(canvas)).toBeDisabled();
    await expect(canvas.getByText('Wybierz model.')).toBeVisible();
    // The Composer is visible but inactive and shows no model or mode pickers.
    await expect(composer(canvas)).toBeDisabled();
    await expect(composer(canvas)).toHaveAttribute(
      'placeholder',
      'Wybierz agenta i rozpocznij sesję',
    );
    await expect(canvas.queryByRole('button', { name: /Wybierz tryb pracy/ })).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Wyślij' })).toBeDisabled();
    // Context: the pinned Specification and the executor mirroring the choice.
    await expect(await canvas.findByText('Logowanie SSO')).toBeVisible();
    await expect(canvas.getByText('nie wybrano')).toBeVisible();
    await expectActionRowClear(canvas);
  },
};

/** Scenario (b): Claude with a model chosen; Effort and Work mode open up, Start becomes possible. */
export const ClaudeModelChosen: Story = {
  args: claudeModelA,
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByRole('radio', { name: /Claude/ })).toBeChecked();
    await expect(canvas.getByRole('combobox', { name: 'Effort' })).toBeEnabled();
    await expect(canvas.getByRole('combobox', { name: 'Effort' })).toHaveTextContent('Domyślny');
    // The provider's default mode is preselected.
    await expect(canvas.getByRole('radio', { name: 'Accept edits' })).toBeChecked();
    await expect(startButton(canvas)).toBeEnabled();
    await expect(
      canvas.getByText('Sesja otworzy się bez wiadomości, a agent nada jej nazwę po pierwszej.'),
    ).toBeVisible();
    // Context mirrors the choice (field value and executor row); the Composer stays inactive.
    await expect(inContext(canvas, 'claude model A')).toBe(true);
    await expect(composer(canvas)).toBeDisabled();
    await expectActionRowClear(canvas);
  },
};

/** Thirteen models: the Model field is the searchable Combobox, filtered by typing. */
export const AntigravityLongModelList: Story = {
  args: {
    defaults: {
      agent: {
        providerId: 'antigravity',
        modelId: '',
        effort: 'provider-default',
        mode: 'planning',
      },
    },
  },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByRole('radio', { name: /Antigravity/ })).toBeChecked();
    const model = canvas.getByRole('combobox', { name: 'Model' });
    await expect(model.tagName).toBe('INPUT');
    await userEvent.click(model);
    await expect(await body().findAllByRole('option')).toHaveLength(13);
    // The repeated title is told apart by its id.
    await expect(body().getAllByText('agy-12')).toHaveLength(1);
    await expect(body().getAllByText('agy-13')).toHaveLength(1);
    const options = within(await body().findByRole('listbox'));
    await userEvent.click(await options.findByRole('option', { name: /Gemini 2 Pro/ }));
    await waitFor(() => expect(body().queryByRole('listbox')).toBeNull());
    await expect(canvas.getByRole('radio', { name: 'Planowanie' })).toBeChecked();
    await expect(startButton(canvas)).toBeEnabled();
  },
};

/** Scenario (c): Start locks the form and says so; the Composer is still inactive. */
export const Starting: Story = {
  args: {
    ...claudeModelA,
    allocation: 'never',
    defaults: { ...claudeModelA.defaults, status: 'starting' },
  },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByRole('button', { name: 'Rozpoczynanie…' })).toBeDisabled();
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toBeDisabled();
    await expect(provider(canvas, /Claude/)).toBeDisabled();
    await expect(composer(canvas)).toBeDisabled();
    await expect(inContext(canvas, 'claude model A')).toBe(true);
  },
};

/** Scenario (c): the Session exists; its first snapshot is loading, and the start values stand in. */
export const StartedWhileLoading: Story = {
  render: () => (
    <DemoStartedPreview
      snapshot="loading"
      providerId="claude"
      providerIcon="claude"
      providerTitle="Claude"
      modelId="model-a"
      modelTitle="claude model A"
      modeId="acceptEdits"
      modeTitle="Accept edits"
    />
  ),
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByText('Claude jest gotowy')).toBeVisible();
    // No loading text: the Composer is already in its place with the start values.
    await expect(canvas.queryByText('Wczytywanie sesji…')).toBeNull();
    await expect(canvas.getByRole('heading', { level: 1, name: 'Nowa sesja' })).toBeVisible();
    await expect(composer(canvas)).toBeDisabled();
    await expect(canvas.getByRole('button', { name: /claude model A/ })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: /Accept edits/ })).toBeDisabled();
    await expect(await canvas.findByText('Logowanie SSO')).toBeVisible();
    await expect(inContext(canvas, 'claude model A')).toBe(true);
  },
};

/** Scenario (c): the Session screen is empty: the ready empty state, the Composer active and focused. */
export const Started: Story = {
  render: () => (
    <DemoStartedPreview
      providerId="claude"
      providerIcon="claude"
      providerTitle="Claude"
      modelId="model-a"
      modelTitle="claude model A"
      modeId="acceptEdits"
      modeTitle="Accept edits"
    />
  ),
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByText('Claude jest gotowy')).toBeVisible();
    await expect(
      canvas.getByText('Napisz wiadomość poniżej, aby rozpocząć rozmowę.'),
    ).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Rozpocznij sesję' })).toBeNull();
    await waitFor(() => expect(composer(canvas)).toBeEnabled());
    await waitFor(() => expect(composer(canvas)).toHaveFocus());
    // The model and mode are not repeated in the empty state; the Composer's own pickers carry them.
    await expect(canvas.getByRole('button', { name: /claude model A/ })).toBeEnabled();
    await expect(canvas.getByRole('button', { name: /Accept edits/ })).toBeEnabled();
    await expect(canvas.getByRole('heading', { level: 1, name: 'Nowa sesja' })).toBeVisible();
  },
};

/** The Session exists but its snapshot cannot be read: the header and the body say so, not "ready". */
export const StartedWhileConnectionFails: Story = {
  render: () => (
    <DemoStartedPreview
      snapshot="failed"
      providerId="claude"
      providerIcon="claude"
      providerTitle="Claude"
      modelId="model-a"
      modelTitle="claude model A"
    />
  ),
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByText('Nie udało się wczytać tej części sesji.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Spróbuj ponownie' })).toBeEnabled();
    await expect(canvas.getByRole('heading', { level: 1, name: 'Nowa sesja' })).toBeVisible();
    await expect(canvas.getByText('Utracono połączenie')).toBeVisible();
    await expect(canvas.queryByText('Gotowa')).toBeNull();
    await expect(canvas.queryByText('Claude jest gotowy')).toBeNull();
  },
};

/** Scenario (f): the allocation failed; the choices stay and the form unlocks. */
export const StartFailed: Story = {
  args: { ...claudeModelA, defaults: { ...claudeModelA.defaults, status: 'failed' } },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Nie udało się rozpocząć sesji',
    );
    await expect(provider(canvas, /Claude/)).toBeChecked();
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toHaveTextContent(
      'claude model A',
    );
    await expect(startButton(canvas)).toBeEnabled();
    await expect(composer(canvas)).toBeDisabled();
    await expectActionRowClear(canvas);
  },
};

/** Scenario (e): no executor is available; every tile says why and nothing can start. */
export const NoProviderAvailable: Story = {
  args: { catalogue: noProviderCatalogue },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByText('Żaden wykonawca nie jest teraz dostępny.')).toBeVisible();
    await expect(provider(canvas, /Codex/)).toBeDisabled();
    await expect(canvas.getAllByText('Nie zalogowano do CLI.')).toHaveLength(3);
    await expect(startButton(canvas)).toBeDisabled();
    await expect(composer(canvas)).toBeDisabled();
    await expect(canvas.getByText('nie wybrano')).toBeVisible();
  },
};

/**
 * The whole flow by interaction, with the allocation it sends: the agent names the Session, so the
 * Session opens as "New session" with the ready empty state and a focused Composer, and no effort
 * is sent at the provider default.
 */
export const AgentNamesSession: Story = {
  play: async ({ canvas }) => {
    await settle();
    // (a) The Specification is the pinned, read-only context: no first message, no workspace section.
    await expect(await canvas.findByText('Logowanie SSO')).toBeVisible();
    await expect(canvas.queryByRole('textbox', { name: 'Pierwsza wiadomość' })).toBeNull();
    await expect(canvas.queryByText('Miejsce pracy')).toBeNull();
    // (c) The default is legible before starting: the agent names the Session, no name field.
    await expect(
      canvas.getByText('Agent nada sesji nazwę na podstawie Twojej pierwszej wiadomości.'),
    ).toBeVisible();
    await expect(canvas.queryByRole('textbox', { name: 'Nazwa sesji' })).toBeNull();
    // (b) Tiles, then the labelled fields.
    await expect(provider(canvas, /Codex/)).toBeChecked();
    await expect(startButton(canvas)).toBeDisabled();
    await expect(canvas.getByText('Wybierz model.')).toBeVisible();
    await pick(canvas, 'Model', 'codex model A');
    await expect(canvas.getByRole('radio', { name: 'Agent' })).toBeChecked();
    await expect(startButton(canvas)).toBeEnabled();
    await userEvent.click(startButton(canvas));
    await waitFor(() =>
      expect(allocations).toEqual([
        expect.objectContaining({ providerId: 'codex', modelId: 'model-a', mode: 'agent' }),
      ]),
    );
    await expect(allocations[0]).not.toHaveProperty('effort');
    // The Session opens in place of the form: no loading text, ready empty state, focused Composer.
    await expect(await canvas.findByText('Codex jest gotowy')).toBeVisible();
    await expect(canvas.queryByText('Wczytywanie sesji…')).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Rozpocznij sesję' })).toBeNull();
    await expect(canvas.getByRole('heading', { level: 1, name: 'Nowa sesja' })).toBeVisible();
    await waitFor(() => expect(composer(canvas)).toHaveFocus());
    // The first message is written in the Session itself and reaches the Runtime. (Naming the
    // Session from it is not part of this composition: the Session screen has no naming state yet,
    // see the contract's section 10; `Session Naming Status` stories cover that flow.)
    await userEvent.type(composer(canvas), firstMessage);
    await userEvent.click(canvas.getByRole('button', { name: 'Wyślij' }));
    await waitFor(() =>
      expect(turns).toEqual([expect.objectContaining({ message: firstMessage })]),
    );
    await expect(canvas.getByRole('heading', { level: 1, name: 'Nowa sesja' })).toBeVisible();
  },
};

/** Scenario (c) alternative: an own name, switching back keeps the text but the agent names it. */
export const OwnName: Story = {
  play: async ({ canvas }) => {
    await settle();
    await canvas.findByText('Logowanie SSO');
    await pick(canvas, 'Model', 'codex model A');
    await userEvent.click(canvas.getByRole('switch', { name: 'Nadaj własną nazwę' }));
    const field = canvas.getByRole('textbox', { name: 'Nazwa sesji' });
    await expect(canvas.getByRole('switch', { name: 'Nadaj własną nazwę' })).toBeChecked();
    await expect(field).toHaveAttribute('maxlength', '256');
    await expect(canvas.getByText('Do 256 znaków.')).toBeVisible();
    // A chosen own name must not be blank.
    await expect(startButton(canvas)).toBeDisabled();
    await expect(canvas.getByText('Wpisz nazwę albo pozwól agentowi ją nadać.')).toBeVisible();
    await userEvent.type(field, 'Przegląd SSO — błędy');
    await expect(startButton(canvas)).toBeEnabled();
    // Switching back hides the field and keeps the text; the agent names the Session again.
    await userEvent.click(canvas.getByRole('switch', { name: 'Nadaj własną nazwę' }));
    await expect(canvas.queryByRole('textbox', { name: 'Nazwa sesji' })).toBeNull();
    await expect(
      canvas.getByText('Agent nada sesji nazwę na podstawie Twojej pierwszej wiadomości.'),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('switch', { name: 'Nadaj własną nazwę' }));
    await expect(canvas.getByRole('textbox', { name: 'Nazwa sesji' })).toHaveValue(
      'Przegląd SSO — błędy',
    );
    // Enter in the name field starts the Session; the own name is the title at once.
    await userEvent.type(canvas.getByRole('textbox', { name: 'Nazwa sesji' }), '{Enter}');
    await expect(
      await canvas.findByRole('heading', { level: 1, name: 'Przegląd SSO — błędy' }),
    ).toBeVisible();
    await expect(canvas.queryByText('Nadawanie nazwy…')).toBeNull();
  },
};

export const OwnNameMobile: Story = {
  globals: mobile,
  play: async ({ canvas }) => {
    await settle(375, 812);
    await canvas.findByText('Logowanie SSO').catch(() => undefined);
    await userEvent.click(await canvas.findByRole('switch', { name: 'Nadaj własną nazwę' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Nazwa sesji' }), 'x'.repeat(240));
    await expect(canvas.getByText('Pozostało znaków: 16.')).toBeVisible();
    await expectNoHorizontalScroll();
  },
};

/** Scenario (b): an explicit effort and work mode reach the allocation; no effort = provider default. */
export const EffortAndMode: Story = {
  play: async ({ canvas }) => {
    await settle();
    await canvas.findByText('Logowanie SSO');
    await pick(canvas, 'Model', 'codex model A');
    // The effort field opens with the provider default chosen.
    await expect(canvas.getByRole('combobox', { name: 'Effort' })).toHaveTextContent('Domyślny');
    await pick(canvas, 'Effort', 'high');
    await expect(canvas.getByRole('combobox', { name: 'Effort' })).toHaveTextContent('high');
    // Only the modes the chosen model runs are listed.
    await userEvent.click(canvas.getByRole('radio', { name: 'Ask' }));
    await expect(canvas.getByRole('radio', { name: 'Ask' })).toBeChecked();
    await userEvent.click(startButton(canvas));
    await waitFor(() =>
      expect(allocations).toEqual([
        expect.objectContaining({ modelId: 'model-a', effort: 'high', mode: 'ask' }),
      ]),
    );
  },
};

/** Scenario (f): the Runtime refuses — the form and choices stay; the alert is retired by an edit. */
export const AllocationFails: Story = {
  args: { allocation: 'failed' },
  play: async ({ canvas }) => {
    await settle();
    await canvas.findByText('Logowanie SSO');
    await pick(canvas, 'Model', 'codex model A');
    await userEvent.click(startButton(canvas));
    await expect(await canvas.findByRole('alert')).toBeVisible();
    await expect(provider(canvas, /Codex/)).toBeChecked();
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toHaveTextContent(
      'codex model A',
    );
    await expect(canvas.queryByText('Nadawanie nazwy…')).toBeNull();
    // Editing the choices retires the alert of that attempt.
    await userEvent.click(canvas.getByRole('radio', { name: 'Ask' }));
    await waitFor(() => expect(canvas.queryByRole('alert')).toBeNull());
  },
};

/**
 * Scenario (f): the answer is lost, so the outcome is unknown: the form is locked and only checking
 * what became of the same operation is offered — it is never repeated blindly.
 */
export const UnknownOutcome: Story = {
  args: { allocation: 'unknown' },
  play: async ({ canvas }) => {
    await settle();
    await canvas.findByText('Logowanie SSO');
    await pick(canvas, 'Model', 'codex model A');
    await userEvent.click(startButton(canvas));
    await expect(await canvas.findByRole('button', { name: 'Sprawdź wynik' })).toBeEnabled();
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toBeDisabled();
    await expect(provider(canvas, /Codex/)).toBeDisabled();
    await expect(
      canvas.getByText('Operacja jest zachowana pod tym samym identyfikatorem.'),
    ).toBeVisible();
    await expect(allocations).toHaveLength(1);
    // Checking resends the same operation; the Session was not created, so it stays unresolved.
    await userEvent.click(canvas.getByRole('button', { name: 'Sprawdź wynik' }));
    await waitFor(() => expect(allocations).toHaveLength(2));
    await expect(allocations[1]).toEqual(allocations[0]);
  },
};

/** Narrow 375 px, open: one column, no Composer before Start, no horizontal scroll. */
export const NarrowOpen: Story = {
  globals: mobile,
  play: async ({ canvas }) => {
    await settle(375, 812);
    await expect(
      await canvas.findByRole('heading', { level: 2, name: 'Rozpocznij sesję' }),
    ).toBeVisible();
    // No Composer before Start on a phone: it would only take space from the form.
    await expect(canvas.queryByRole('textbox', { name: 'Wiadomość' })).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Kontekst' })).toBeVisible();
    await expectNoHorizontalScroll();
    await expectActionRowClear(canvas);
  },
};

export const NarrowModelChosen: Story = {
  globals: mobile,
  args: claudeModelA,
  play: async ({ canvas }) => {
    await settle(375, 812);
    await expect(await canvas.findByRole('radio', { name: 'Accept edits' })).toBeEnabled();
    await expect(canvas.queryByRole('textbox', { name: 'Wiadomość' })).toBeNull();
    await expect(startButton(canvas)).toBeEnabled();
    await expectNoHorizontalScroll();
    await expectActionRowClear(canvas);
  },
};

/** Narrow flow: choose a model, Start; the Session opens with the Composer docked and focused. */
export const NarrowStartFlow: Story = {
  globals: mobile,
  play: async ({ canvas }) => {
    await settle(375, 812);
    await pick(canvas, 'Model', 'codex model A');
    // The model and the work mode fields fit the 375 px column.
    const model = canvas.getByRole('combobox', { name: 'Model' });
    await expect(model.getBoundingClientRect().right).toBeLessThanOrEqual(375);
    const modes = canvas.getByRole('radiogroup', { name: 'Tryb pracy' });
    await expect(modes.getBoundingClientRect().right).toBeLessThanOrEqual(375);
    await expectNoHorizontalScroll();
    await userEvent.click(startButton(canvas));
    await expect(await canvas.findByText('Codex jest gotowy')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Rozpocznij sesję' })).toBeNull();
    await expect(canvas.getByRole('heading', { level: 1, name: 'Nowa sesja' })).toBeVisible();
    await waitFor(() => expect(composer(canvas)).toHaveFocus());
    await expect(canvas.queryByText('Nadawanie nazwy…')).toBeNull();
    await expectNoHorizontalScroll();
  },
};

export const NarrowNoProviderAvailable: Story = {
  ...NoProviderAvailable,
  globals: mobile,
  play: async ({ canvas }) => {
    await settle(375, 812);
    await expect(await canvas.findByText('Żaden wykonawca nie jest teraz dostępny.')).toBeVisible();
    await expectNoHorizontalScroll();
  },
};

export const NarrowStarted: Story = {
  ...Started,
  globals: mobile,
  play: async ({ canvas }) => {
    await settle(375, 812);
    await expect(await canvas.findByText('Claude jest gotowy')).toBeVisible();
    await waitFor(() => expect(composer(canvas)).toBeEnabled());
    await waitFor(() => expect(composer(canvas)).toHaveFocus());
    await expectNoHorizontalScroll();
  },
};
