import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { withLocale } from '../../../../i18n/StoryLocalization';
import { browserPage } from '../../../../test-support/browserPage';
import { settleViewport } from '../../../../test-support/viewportSettle.stories-support';
import { noProviderCatalogue } from './sessionStartCatalogue.stories-support';
import { SessionStartShellPreview } from './sessionStartShell.stories-support';

/**
 * Starting a new Session inside the Session screen itself
 * (`docs/ideas/specflow-ui/screens/new-session-ui-spec.md`, revision 2): the full shell at once, the
 * pinned Specification in Context, the start card in the conversation column and the Composer
 * visible but inactive until Start. Every state is rendered from the story's args, so it is visible
 * in the plain Storybook UI; the plays only assert it (and `StartFlow` walks the transitions). Start
 * is simulated (about 800 ms). Revision 1's `SpecFlow/Screens/New Session` stories remain until the
 * start card replaces the route.
 */
const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Screens/Session Start (mock)',
  component: SessionStartShellPreview,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SessionStartShellPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
type Canvas = StoryContext['canvas'];

const mobile = { viewport: { value: 'mobile1', isRotated: false } };
const body = () => within(document.body);
const startButton = (canvas: Canvas) =>
  canvas.getByRole('button', { name: /^(Rozpocznij sesję|Rozpoczynanie…)$/ });
/** The text is shown in the Context panel (the executor row), not only in the card's field. */
const inContext = (canvas: Canvas, text: string) =>
  canvas
    .getAllByText(text)
    .some((element) => element.closest('[data-workspace-surface="secondary"]') !== null);
const composer = (canvas: Canvas) => canvas.getByRole('textbox', { name: 'Wiadomość' });
const provider = (canvas: Canvas, name: RegExp) => canvas.getByRole('radio', { name });

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
 * The card's action row is reachable and never covered by the Composer: scrolled to the end of the
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

/** Picks an option of the Model or Work mode field, whichever control (Select or Combobox) it is. */
async function pick(canvas: Canvas, field: 'Model' | 'Tryb pracy', option: string) {
  await userEvent.click(canvas.getByRole('combobox', { name: field }));
  await userEvent.click(await body().findByRole('option', { name: new RegExp(option) }));
  await waitFor(() => expect(body().queryByRole('listbox')).toBeNull());
}

const claudeModelA = { initialProviderId: 'claude', initialModelId: 'model-a' } as const;

/** Scenario (a): nothing chosen but the provider; the shell is there, only the card is active. */
export const Open: Story = {
  play: async ({ canvas }) => {
    await settle();
    await expect(canvas.getByRole('heading', { level: 1, name: 'Nowa sesja' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 2, name: 'Rozpocznij sesję' })).toBeVisible();
    // The three field rows exist before a model is chosen; Effort and Work mode wait for it.
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toBeEnabled();
    await expect(canvas.getByRole('radiogroup', { name: 'Effort' })).toBeVisible();
    await expect(canvas.getByRole('radio', { name: 'Domyślny' })).toBeDisabled();
    await expect(canvas.getByRole('combobox', { name: 'Tryb pracy' })).toBeDisabled();
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
    await expect(canvas.getByText('Logowanie SSO')).toBeVisible();
    await expect(canvas.getByText('nie wybrano')).toBeVisible();
    await expectActionRowClear(canvas);
  },
};

/** Scenario (b): Claude with a model chosen; Effort and Work mode open up, Start becomes possible. */
export const ClaudeModelChosen: Story = {
  args: claudeModelA,
  play: async ({ canvas }) => {
    await settle();
    await expect(provider(canvas, /Claude/)).toBeChecked();
    await expect(canvas.getByRole('radio', { name: 'Domyślny' })).toBeChecked();
    await expect(canvas.getByRole('radio', { name: 'low' })).toBeEnabled();
    await expect(canvas.getByRole('radio', { name: 'high' })).toBeEnabled();
    // The provider's default mode is preselected.
    await expect(canvas.getByRole('combobox', { name: 'Tryb pracy' })).toHaveTextContent(
      'Accept edits',
    );
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
  args: { initialProviderId: 'antigravity' },
  play: async ({ canvas }) => {
    await settle();
    await expect(provider(canvas, /Antigravity/)).toBeChecked();
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
    await expect(canvas.getByRole('combobox', { name: 'Tryb pracy' })).toHaveTextContent(
      'Planowanie',
    );
    await expect(startButton(canvas)).toBeEnabled();
  },
};

/** Scenario (c): Start locks the card and says so; the Composer is still inactive. */
export const Starting: Story = {
  args: { ...claudeModelA, phase: 'starting' },
  play: async ({ canvas }) => {
    await settle();
    await expect(canvas.getByRole('button', { name: 'Rozpoczynanie…' })).toBeDisabled();
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toBeDisabled();
    await expect(provider(canvas, /Claude/)).toBeDisabled();
    await expect(composer(canvas)).toBeDisabled();
    await expect(inContext(canvas, 'claude model A')).toBe(true);
  },
};

/** Scenario (c): the card is replaced by the summary line; the Composer is active and focused. */
export const Started: Story = {
  args: { ...claudeModelA, phase: 'started' },
  play: async ({ canvas }) => {
    await settle();
    await expect(canvas.getByText('Claude jest gotowy')).toBeVisible();
    await expect(
      canvas.getByText('Napisz wiadomość poniżej, aby rozpocząć rozmowę.'),
    ).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Rozpocznij sesję' })).toBeNull();
    await expect(composer(canvas)).toBeEnabled();
    await waitFor(() => expect(composer(canvas)).toHaveFocus());
    // The model and mode are not repeated in the empty state; the Composer's own pickers carry the chosen model and mode.
    await expect(canvas.getByRole('button', { name: /claude model A/ })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /Accept edits/ })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 1, name: 'Nowa sesja' })).toBeVisible();
  },
};

/** Scenario (f): the allocation failed; the choices stay and the card unlocks. */
export const StartFailed: Story = {
  args: { ...claudeModelA, phase: 'failed' },
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
    await expect(canvas.getByText('Żaden wykonawca nie jest teraz dostępny.')).toBeVisible();
    await expect(provider(canvas, /Codex/)).toBeDisabled();
    await expect(canvas.getAllByText('Nie zalogowano do CLI.')).toHaveLength(3);
    await expect(startButton(canvas)).toBeDisabled();
    await expect(composer(canvas)).toBeDisabled();
    await expect(canvas.getByText('nie wybrano')).toBeVisible();
  },
};

/** The whole flow by interaction: Open, choose Claude and a model, Start, Started. */
export const StartFlow: Story = {
  play: async ({ canvas }) => {
    await settle();
    await userEvent.click(provider(canvas, /Claude/));
    await pick(canvas, 'Model', 'claude model A');
    await expect(startButton(canvas)).toBeEnabled();
    await userEvent.click(startButton(canvas));
    await expect(await canvas.findByRole('button', { name: 'Rozpoczynanie…' })).toBeDisabled();
    await expect(composer(canvas)).toBeDisabled();
    await expect(
      await canvas.findByText('Claude jest gotowy', {}, { timeout: 4000 }),
    ).toBeVisible();
    await expect(composer(canvas)).toBeEnabled();
    await waitFor(() => expect(composer(canvas)).toHaveFocus());
  },
};

/** Narrow 375 px, open: one column, the inactive Composer docked, no horizontal scroll. */
export const NarrowOpen: Story = {
  globals: mobile,
  play: async ({ canvas }) => {
    await settle(375, 812);
    await expect(canvas.getByRole('heading', { level: 2, name: 'Rozpocznij sesję' })).toBeVisible();
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
    await expect(canvas.queryByRole('textbox', { name: 'Wiadomość' })).toBeNull();
    await expect(startButton(canvas)).toBeEnabled();
    await expect(canvas.getByRole('combobox', { name: 'Tryb pracy' })).toBeEnabled();
    await expectNoHorizontalScroll();
    await expectActionRowClear(canvas);
  },
};

export const NarrowStarted: Story = {
  globals: mobile,
  args: { ...claudeModelA, phase: 'started' },
  play: async ({ canvas }) => {
    await settle(375, 812);
    await expect(canvas.getByText('Claude jest gotowy')).toBeVisible();
    await expect(composer(canvas)).toBeEnabled();
    await waitFor(() => expect(composer(canvas)).toHaveFocus());
    await expectNoHorizontalScroll();
  },
};
