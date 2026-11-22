import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { withLocale } from '../../../../i18n/StoryLocalization';
import { browserPage } from '../../../../test-support/browserPage';
import { settleViewport } from '../../../../test-support/viewportSettle.stories-support';
import {
  antigravityDescriptor,
  claudeDescriptor,
  codexDescriptor,
  codexCheckInterrupted,
  codexLauncherWithoutExecutable,
  codexNotFound,
  unavailableProviders,
  undeterminedProviders,
} from '../catalogue/providerDescriptors.stories-support';
import { providerDescriptor } from '../catalogue/startCatalogue.stories-support';
import { catalogueReads, creates, ManagedStartPreview } from './sessionStart.stories-support';

/**
 * A Specification's New Session on the managed (project) Runtime (`/specs/$specId/sessions/new`):
 * the same Session screen and form as the demo's, over the Runtime's own provider catalogue
 * (readiness, reasons, native work modes) and the composed create `POST /api/specs/:specId/sessions`
 * (`docs/product/specflow/ui/full-session.md` "Starting a Session"). The real start source runs
 * over a faked transport; a created Session opens as in the route. Every state is rendered from the
 * story's args; the plays only assert it and walk the flow.
 */
const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Screens/Session Start',
  component: ManagedStartPreview,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ManagedStartPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
type Canvas = StoryContext['canvas'];

const mobile = { viewport: { value: 'mobile1', isRotated: false } };
const body = () => within(document.body);
const startButton = (canvas: Canvas) =>
  canvas.getByRole('button', { name: /^(Rozpocznij sesję|Rozpoczynanie…|Ponów tworzenie)$/ });
const composer = (canvas: Canvas) => canvas.getByRole('textbox', { name: 'Wiadomość' });

/** Sizes the viewport in the test runner; in the plain Storybook UI the toolbar owns it. */
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

/** Picks an option of a picker field, whichever control (Select or Combobox) it is. */
async function pick(canvas: Canvas, field: string, option: string | RegExp) {
  await userEvent.click(await canvas.findByRole('combobox', { name: field }));
  await userEvent.click(await body().findByRole('option', { name: option }));
  await waitFor(() => expect(body().queryByRole('listbox')).toBeNull());
}

const agentLegend = (canvas: Canvas) => canvas.findByText('Agent', { selector: 'legend' });
const howToFix = (canvas: Canvas) => canvas.getByRole('button', { name: 'Jak naprawić' });
/** The details panel is a modal Drawer: it hides the page from assistive technology. */
const panelOpen = { a11y: { test: 'off' as const } };

/** Every agent available: the first one is chosen, the model is the one choice left. */
export const ManagedInSpecification: Story = {
  play: async ({ canvas }) => {
    await settle();
    await expect(canvas.getByRole('heading', { level: 1, name: 'Nowa sesja' })).toBeVisible();
    // One title: the form repeats none.
    await agentLegend(canvas);
    await expect(canvas.queryByRole('heading', { name: 'Rozpocznij sesję' })).toBeNull();
    // The Runtime's own providers, the first available one chosen; Context pins the Specification.
    await expect(canvas.getByRole('radio', { name: /Claude/ })).toBeChecked();
    await expect(canvas.getAllByText('Dostępny')).toHaveLength(3);
    await expect(canvas.queryByRole('button', { name: 'Jak naprawić' })).toBeNull();
    await expect(canvas.getByRole('button', { name: /Logowanie SSO/ })).toBeVisible();
    // Before Start Context lists only Instructions and Environment of the planned areas.
    await expect(canvas.getByRole('button', { name: /Środowisko/ })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /Przekazania/ })).toBeNull();
    await expect(canvas.getByText('nie wybrano modelu')).toBeVisible();
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toBeEnabled();
    await expect(canvas.getByRole('combobox', { name: 'Effort' })).toBeDisabled();
    // The optional name: no switch, the placeholder says what it is called otherwise.
    await expect(canvas.queryByRole('switch')).toBeNull();
    await expect(canvas.getByRole('textbox', { name: /Nazwa sesji/ })).toHaveAttribute(
      'placeholder',
      'Nowa sesja',
    );
    // The form's last row: the hint and Start, inside the form.
    await expect(startButton(canvas)).toBeDisabled();
    await expect(canvas.getByText('Wybierz model.')).toBeVisible();
    await expect(startButton(canvas).closest('form')).not.toBeNull();
  },
};

/** The inactive Composer is docked only while the form and the Composer fit the column together. */
export const ComposerOnlyWhenTheFormFits: Story = {
  play: async ({ canvas }) => {
    await settle(1280, 520);
    await agentLegend(canvas);
    await waitFor(() => expect(canvas.queryByRole('textbox', { name: 'Wiadomość' })).toBeNull());
    await settle(1920, 1080);
    await expect(await canvas.findByRole('textbox', { name: 'Wiadomość' })).toBeDisabled();
    await expect(canvas.getByRole('textbox', { name: 'Wiadomość' })).toHaveAttribute(
      'placeholder',
      'Rozpocznij sesję, aby wysłać wiadomość',
    );
  },
};

/** Claude's own native modes: only the usable ones are listed; the catalogue's unavailable one is
 * omitted, with no reason line (full-session.md "Composer"). */
export const NativeModesWithUnavailableOne: Story = {
  args: {
    defaults: {
      agent: {
        providerId: 'claude',
        modelId: 'claude-sonnet',
        effort: 'high',
        mode: 'acceptEdits',
      },
    },
  },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByRole('radio', { name: 'Accept edits' })).toBeChecked();
    await expect(canvas.getByRole('radio', { name: 'Plan' })).toBeEnabled();
    await expect(canvas.queryByRole('radio', { name: 'Auto' })).toBeNull();
    await expect(canvas.queryByText(/Wymaga zgody administratora/)).toBeNull();
    await expect(canvas.getByRole('combobox', { name: 'Effort' })).toHaveTextContent('high');
    await expect(startButton(canvas)).toBeEnabled();
  },
};

/** A provider that lists no models: Model is the fact "Provider default", and there is no Effort. */
export const ProviderWithoutModels: Story = {
  args: {
    defaults: {
      agent: { providerId: 'codex', modelId: '', effort: 'provider-default', mode: 'agent' },
    },
  },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByText('Domyślny dostawcy')).toBeVisible();
    await expect(canvas.queryByRole('combobox', { name: 'Model' })).toBeNull();
    await expect(canvas.queryByRole('combobox', { name: 'Effort' })).toBeNull();
    // Nothing to wait for: the work mode is decided and Start is possible.
    await expect(canvas.getByRole('radio', { name: 'Agent' })).toBeChecked();
    await expect(startButton(canvas)).toBeEnabled();
    await expect(canvas.queryByText('Wybierz model.')).toBeNull();
  },
};

/** Thirteen models: the Model field is the searchable Combobox, filtered by typing. */
export const ManagedAntigravityLongModelList: Story = {
  args: { providers: [antigravityDescriptor, codexDescriptor] },
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
    await userEvent.click(
      await within(await body().findByRole('listbox')).findByRole('option', {
        name: /Gemini 2 Pro/,
      }),
    );
    await waitFor(() => expect(body().queryByRole('listbox')).toBeNull());
    await expect(canvas.getByRole('radio', { name: 'Planowanie' })).toBeChecked();
    await expect(startButton(canvas)).toBeEnabled();
  },
};

/** More than four usable modes: the Work mode field is a picker; an unavailable mode is omitted. */
export const ManyWorkModes: Story = {
  args: {
    providers: [
      providerDescriptor({
        providerId: 'claude',
        title: 'Claude',
        modes: ['read-only', 'workspace-write'],
        defaultModeId: 'm1',
        providerModes: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((modeId, index) => ({
          modeId,
          title: `Tryb ${index + 1}`,
          nativeMode: modeId,
          mode: 'workspace-write' as const,
          readiness: index === 5 ? ('unavailable' as const) : ('ready' as const),
          ...(index === 5 ? { reason: 'Niedostępny w tym projekcie.' } : {}),
        })),
      }),
    ],
    defaults: {
      agent: { providerId: 'claude', modelId: '', effort: 'provider-default', mode: 'm1' },
    },
  },
  play: async ({ canvas }) => {
    await settle();
    const mode = await canvas.findByRole('combobox', { name: 'Tryb pracy' });
    await expect(mode).toHaveTextContent('Tryb 1');
    await expect(canvas.queryByRole('radiogroup', { name: 'Tryb pracy' })).toBeNull();
    await userEvent.click(mode);
    await body().findByRole('option', { name: 'Tryb 5' });
    await expect(body().getAllByRole('option')).toHaveLength(5);
    await expect(body().queryByRole('option', { name: /Tryb 6/ })).toBeNull();
    await userEvent.keyboard('{Escape}');
  },
};

/** One agent cannot start (Codex: CLI not found): its card says so in one line, the line below offers the fix. */
export const ManagedProviderCliNotFound: Story = {
  args: { providers: [claudeDescriptor, codexNotFound(), antigravityDescriptor] },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByText('Nie znaleziono CLI')).toBeVisible();
    await expect(canvas.getByRole('radio', { name: /Codex/ })).toBeDisabled();
    await expect(canvas.getByText('Codex: nie znaleziono CLI')).toBeVisible();
    await expect(howToFix(canvas)).toBeVisible();
    // The rest of the form is unchanged: the agent chosen, its settings and the form's last row.
    await expect(canvas.getByRole('radio', { name: /Claude/ })).toBeChecked();
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toBeEnabled();
    await expect(startButton(canvas)).toBeDisabled();
  },
};

/**
 * "How to fix" for one agent: its name is the panel's title. Installing is seen by "Check again";
 * pointing to a file is a configuration change, seen only after a restart. Every path discovery
 * checked stays behind a disclosure; code wraps with its indentation kept.
 */
export const ManagedDiagnosticsOneAgent: Story = {
  ...ManagedProviderCliNotFound,
  parameters: panelOpen,
  play: async ({ canvas }) => {
    await settle();
    await userEvent.click(await canvas.findByRole('button', { name: 'Jak naprawić' }));
    const panel = within(await body().findByRole('dialog', { name: 'Codex' }));
    await expect(panel.getByText('Nie znaleziono CLI')).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Zainstaluj CLI' })).toBeVisible();
    await expect(
      panel.getByRole('heading', { name: 'Albo wskaż zainstalowany plik' }),
    ).toBeVisible();
    await expect(panel.getByText(/executable: C:\\path\\to\\codex\.exe/)).toBeVisible();
    await expect(panel.getByText(/konfiguracja jest czytana tylko przy starcie/)).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Sprawdź ponownie' })).toBeEnabled();
    await userEvent.click(panel.getByRole('button', { name: 'Sprawdzone ścieżki (5)' }));
    await expect(await panel.findByText(/\\OpenAI\\Codex\\bin\\\*\\codex\.exe$/)).toBeVisible();
  },
};

/** Installed through npm, but the package's native executable is missing: it needs setting up. */
export const ManagedProviderNpmLauncherBroken: Story = {
  args: { providers: [claudeDescriptor, codexLauncherWithoutExecutable(), antigravityDescriptor] },
  parameters: panelOpen,
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByText('Wymaga konfiguracji')).toBeVisible();
    await userEvent.click(howToFix(canvas));
    const panel = within(await body().findByRole('dialog', { name: 'Codex' }));
    await expect(panel.getByText('npm install -g @openai/codex')).toBeVisible();
  },
};

/** Sign-in needed: the panel gives the CLI's own sign-in command, then "Check again". */
export const ManagedProviderSignInRequired: Story = {
  args: {
    providers: [
      claudeDescriptor,
      {
        ...codexDescriptor,
        readiness: 'authenticationRequired' as const,
        reasonCode: 'AUTHENTICATION_REQUIRED' as const,
        signInCommand:
          'C:\\Users\\dev\\AppData\\Local\\OpenAI\\Codex\\bin\\5449c1f0f26f1f98\\codex.exe login',
      },
      antigravityDescriptor,
    ],
  },
  parameters: panelOpen,
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByText('Wymaga logowania')).toBeVisible();
    await userEvent.click(howToFix(canvas));
    const panel = within(await body().findByRole('dialog', { name: 'Codex' }));
    await expect(panel.getByText(/codex\.exe login$/)).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Sprawdź ponownie' })).toBeEnabled();
  },
};

/**
 * A configuration change is seen only after a restart: the project does not allow Antigravity and
 * this machine turned Codex off. The panel has no "Check again"; it says to restart instead (the UI
 * cannot restart the Runtime).
 */
export const ManagedRestartRequired: Story = {
  args: {
    providers: [
      claudeDescriptor,
      {
        ...codexDescriptor,
        readiness: 'unavailable' as const,
        reasonCode: 'NOT_ENABLED_ON_WORKSTATION' as const,
        reason: 'This provider is turned off on this machine.',
      },
      {
        ...antigravityDescriptor,
        readiness: 'unavailable' as const,
        reasonCode: 'NOT_ALLOWED_BY_PROJECT' as const,
        reason: 'The project does not allow this provider.',
      },
    ],
  },
  parameters: panelOpen,
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByText('Niedostępne: Codex i Antigravity')).toBeVisible();
    await expect(canvas.getAllByText('Wyłączony')).toHaveLength(2);
    await userEvent.click(howToFix(canvas));
    const panel = within(await body().findByRole('dialog', { name: 'Jak naprawić' }));
    await expect(panel.getByText(/sessions\.providers\.codex\.enabled: false/)).toBeVisible();
    await expect(panel.queryByRole('button', { name: 'Sprawdź ponownie' })).toBeNull();
    await expect(panel.getByText(/uruchom ponownie Nevo SpecFlow/)).toBeVisible();
  },
};

/** No agent available: a compact message, "How to fix" first; no fields and no Start. */
export const ManagedNoProviderAvailable: Story = {
  args: { providers: unavailableProviders },
  play: async ({ canvas }) => {
    await settle();
    await expect(
      await canvas.findByRole('heading', { name: 'Żaden agent nie jest dostępny' }),
    ).toBeVisible();
    await expect(canvas.getByRole('radio', { name: /Claude/ })).toBeDisabled();
    await expect(canvas.getByText('Wymaga logowania')).toBeVisible();
    await expect(canvas.getByText('Nie znaleziono CLI')).toBeVisible();
    await expect(canvas.getByText('Wyłączony')).toBeVisible();
    await expect(howToFix(canvas)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Sprawdź ponownie' })).toBeEnabled();
    await expect(canvas.queryByRole('combobox')).toBeNull();
    await expect(canvas.queryByRole('textbox', { name: /Nazwa sesji/ })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Rozpocznij sesję' })).toBeNull();
    await expect(canvas.getByText('nie wybrano')).toBeVisible();
  },
};

/** No agent available, with the details open: a segmented control switches between the agents. */
export const ManagedDiagnosticsSeveralAgents: Story = {
  ...ManagedNoProviderAvailable,
  parameters: panelOpen,
  play: async ({ canvas }) => {
    await settle();
    await userEvent.click(await canvas.findByRole('button', { name: 'Jak naprawić' }));
    const panel = within(await body().findByRole('dialog', { name: 'Jak naprawić' }));
    await expect(panel.getByText('claude auth login')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Sprawdź ponownie' })).toBeEnabled();
    await userEvent.click(panel.getByRole('radio', { name: 'Antigravity' }));
    await expect(await panel.findByText(/antigravity\.enabled: false/)).toBeVisible();
    await expect(panel.queryByRole('button', { name: 'Sprawdź ponownie' })).toBeNull();
  },
};

/**
 * Codex's check did not finish: undetermined, not unavailable. The clock reads as pending, and
 * "Check again" comes first.
 */
export const ManagedCheckInterrupted: Story = {
  args: { providers: [claudeDescriptor, codexCheckInterrupted(), antigravityDescriptor] },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByText('Sprawdzanie przerwane')).toBeVisible();
    await expect(canvas.getByText('Codex: sprawdzanie przerwane')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Sprawdź ponownie' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Szczegóły' })).toBeVisible();
  },
};

/** No agent available and one check gave no result: availability is not determined. */
export const ManagedAvailabilityUndetermined: Story = {
  args: { providers: undeterminedProviders },
  play: async ({ canvas }) => {
    await settle();
    await expect(
      await canvas.findByRole('heading', { name: 'Nie udało się ustalić dostępności' }),
    ).toBeVisible();
    await expect(canvas.getByText('Niezgodna wersja')).toBeVisible();
    await expect(canvas.getByText('Wymaga konfiguracji')).toBeVisible();
    await expectNoHorizontalScroll();
  },
};

/** A ready provider that can run no work mode is not startable: disabled, the reason in its details. */
export const ManagedProviderWithoutUsableMode: Story = {
  args: {
    providers: [
      {
        ...claudeDescriptor,
        providerModes: claudeDescriptor.providerModes?.map((mode) => ({
          ...mode,
          readiness: 'unavailable' as const,
          reason: 'Wymaga zgody administratora.',
        })),
      },
      providerDescriptor({ providerId: 'codex', title: 'Codex', modes: [] }),
    ],
  },
  parameters: panelOpen,
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByRole('radio', { name: /Claude/ })).toBeDisabled();
    await expect(canvas.getByRole('radio', { name: /Claude/ })).not.toBeChecked();
    await expect(canvas.getByRole('radio', { name: /Codex/ })).toBeDisabled();
    await userEvent.click(howToFix(canvas));
    const panel = within(await body().findByRole('dialog', { name: 'Jak naprawić' }));
    await expect(panel.getByText('Wymaga zgody administratora.')).toBeVisible();
  },
};

/** A Specification in its own worktree: the providers bound to the project checkout say so. */
export const ManagedProviderNotForSpecificationWorktree: Story = {
  args: {
    providers: [
      claudeDescriptor,
      ...[codexDescriptor, antigravityDescriptor].map((descriptor) => ({
        ...descriptor,
        readiness: 'unavailable' as const,
        reasonCode: 'SPECIFICATION_WORKTREE_UNSUPPORTED' as const,
        reason: "This provider runs only in the Runtime's own checkout.",
      })),
    ],
  },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByRole('radio', { name: /Claude/ })).toBeChecked();
    for (const name of [/Codex/, /Antigravity/]) {
      await expect(canvas.getByRole('radio', { name })).toBeDisabled();
    }

    await expect(canvas.getAllByText('Nie w worktree')).toHaveLength(2);
    await expect(canvas.queryByText(/Runtime's own checkout/)).toBeNull();
  },
};

/** Scenario (c): Start locks the form and says so; the Composer is still inactive. */
export const ManagedStarting: Story = {
  args: {
    outcome: 'never',
    defaults: {
      agent: {
        providerId: 'claude',
        modelId: 'claude-sonnet',
        effort: 'provider-default',
        mode: 'plan',
      },
      status: 'starting',
    },
  },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByRole('button', { name: 'Rozpoczynanie…' })).toBeDisabled();
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toBeDisabled();
    await expect(canvas.getByRole('radio', { name: /Claude/ })).toBeDisabled();
  },
};

/** Scenario (f): the creation fails — the alert shows, the choices stay and the form unlocks. */
export const ManagedStartFailed: Story = {
  args: {
    outcome: 'failed',
    defaults: {
      agent: {
        providerId: 'claude',
        modelId: 'claude-haiku',
        effort: 'provider-default',
        mode: 'plan',
      },
      status: 'failed',
    },
  },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Nie udało się rozpocząć sesji',
    );
    await expect(canvas.getByRole('radio', { name: /Claude/ })).toBeChecked();
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toHaveTextContent('Claude Haiku');
    await expect(startButton(canvas)).toBeEnabled();
  },
};

/**
 * The whole flow: choose a model, Start fails (a lost response keeps the request), then the same
 * request is retried and the Session opens with the ready empty state and a focused Composer.
 */
export const ManagedStartFlow: Story = {
  args: { outcome: 'ok' },
  play: async ({ canvas }) => {
    await settle();
    await userEvent.click(await canvas.findByRole('radio', { name: /Claude/ }));
    await pick(canvas, 'Model', 'Claude Sonnet');
    await pick(canvas, 'Effort', 'high');
    await userEvent.click(canvas.getByRole('radio', { name: 'Plan' }));
    await expect(
      canvas.getByText('Sesja otworzy się bez wiadomości. Nazwę możesz nadać później.'),
    ).toBeVisible();
    await userEvent.type(canvas.getByRole('textbox', { name: /Nazwa sesji/ }), 'Przegląd SSO');
    await expect(
      canvas.getByText('Sesja otworzy się bez wiadomości, z Twoją nazwą.'),
    ).toBeVisible();
    await userEvent.click(startButton(canvas));
    await waitFor(() =>
      expect(creates).toEqual([
        expect.objectContaining({
          providerId: 'claude',
          modelId: 'claude-sonnet',
          effort: 'high',
          mode: 'read-only',
          providerModeId: 'plan',
          title: 'Przegląd SSO',
        }),
      ]),
    );
    // The Session opens in place of the form: no loading text, the ready empty state, the own name.
    await expect(await canvas.findByText('Claude jest gotowy')).toBeVisible();
    await expect(canvas.queryByText('Wczytywanie sesji…')).toBeNull();
    await expect(canvas.queryByText('Agent', { selector: 'legend' })).toBeNull();
    await expect(canvas.getByRole('heading', { level: 1, name: 'Przegląd SSO' })).toBeVisible();
    await waitFor(() => expect(composer(canvas)).toHaveFocus());
    await expect(composer(canvas)).toBeEnabled();
    await expect(canvas.getByRole('button', { name: /Claude Sonnet/ })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /Plan/ })).toBeVisible();
    // The composed create's association seeded the Session's Context: the Specification stays.
    await expect(canvas.getByRole('button', { name: /Logowanie SSO/ })).toBeVisible();
  },
};

/** Narrow 375 px: one column, no Composer before Start, Context from the header. */
export const NarrowManagedInSpecification: Story = {
  globals: mobile,
  play: async ({ canvas }) => {
    await settle(375, 812);
    await agentLegend(canvas);
    await expect(canvas.queryByRole('textbox', { name: 'Wiadomość' })).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Kontekst' })).toBeVisible();
    // The form's last row stays in the form: no bar fixed over the page.
    await expect(startButton(canvas).closest('form')).not.toBeNull();
    await expectNoHorizontalScroll();
  },
};

/** Narrow: an own list of native modes fits the 375 px row. */
export const NarrowNativeModes: Story = {
  ...NativeModesWithUnavailableOne,
  globals: mobile,
  play: async ({ canvas }) => {
    await settle(375, 812);
    await expect(await canvas.findByRole('radio', { name: 'Accept edits' })).toBeChecked();
    await expect(startButton(canvas)).toBeEnabled();
    await expectNoHorizontalScroll();
  },
};

/** Narrow, no agent available: the sheet steps back, so the short content just ends. */
export const NarrowManagedNoProviderAvailable: Story = {
  ...ManagedNoProviderAvailable,
  globals: mobile,
  play: async ({ canvas }) => {
    await settle(375, 812);
    await canvas.findByRole('heading', { name: 'Żaden agent nie jest dostępny' });
    await expect(document.querySelector('[data-workspace-sheet="plain"]')).not.toBeNull();
    await expectNoHorizontalScroll();
  },
};

/** Narrow, the details of several agents: a bottom sheet whose body scrolls between fixed edges. */
export const NarrowManagedDiagnosticsSeveralAgents: Story = {
  ...ManagedDiagnosticsSeveralAgents,
  globals: mobile,
  play: async ({ canvas }) => {
    await settle(375, 560);
    await userEvent.click(await canvas.findByRole('button', { name: 'Jak naprawić' }));
    const dialog = await body().findByRole('dialog', { name: 'Jak naprawić' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Codex' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sprawdzone ścieżki (5)' }));
    // The header and the footer stay on screen; nothing scrolls sideways.
    await expect(within(dialog).getByRole('heading', { name: 'Jak naprawić' })).toBeVisible();
    await expect(within(dialog).getByRole('button', { name: 'Sprawdź ponownie' })).toBeVisible();
    await expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
  },
};

/** The Runtime lists no provider at all: the picker says so, nothing below it can be chosen. */
export const ManagedEmptyCatalogue: Story = {
  args: { providers: [] },
  play: async ({ canvas }) => {
    await settle();
    // Why no agent is listed, and reading the list again: nothing per agent to diagnose.
    await expect(
      await canvas.findByRole('heading', { level: 2, name: 'Brak agentów na liście' }),
    ).toBeVisible();
    await expect(canvas.getByText(/sessions\.providers\.<dostawca>\.allowed: true/)).toBeVisible();
    const recheck = canvas.getByRole('button', { name: 'Sprawdź ponownie' });
    await expect(recheck).toBeEnabled();
    await userEvent.click(recheck);
    // The recheck reads the catalogue again and asks the Runtime to discover from scratch.
    await waitFor(() => expect(catalogueReads.at(-1)).toMatchObject({ recheck: 'true' }));
    await expect(canvas.queryByRole('combobox')).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Rozpocznij sesję' })).toBeNull();
    await expectNoHorizontalScroll();
  },
};

const longName =
  'Przegląd kryteriów akceptacji logowania SSO z dostawcą tożsamości i obsługą wygasłych sesji';

/**
 * English, with the longest statuses ("Incompatible version", "Check didn't finish") and a long
 * own name: every card keeps one line and 72 px, the name wraps nowhere it should not.
 */
export const ManagedLongNameAndStatusEn: Story = {
  decorators: [withLocale('en')],
  args: {
    providers: [
      claudeDescriptor,
      codexCheckInterrupted(),
      {
        ...antigravityDescriptor,
        readiness: 'unavailable' as const,
        reasonCode: 'KNOWN_INCOMPATIBILITY' as const,
        reason: 'Antigravity 2.0.1 is recorded as incompatible.',
      },
    ],
    defaults: {
      agent: { providerId: 'claude', modelId: 'claude-sonnet', effort: 'high', mode: 'plan' },
      name: { mode: 'custom', value: longName },
    },
  },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByText('Incompatible version')).toBeVisible();
    await expect(canvas.getByText("Check didn't finish")).toBeVisible();
    await expect(canvas.getByText('Unavailable: Codex and Antigravity')).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: /Session name/ })).toHaveValue(longName);
    await expect(
      canvas.getByText('The session opens without a message, with your name.'),
    ).toBeVisible();
    for (const card of within(canvas.getByRole('radiogroup', { name: 'Agent' })).getAllByRole(
      'radio',
    )) {
      const label = card.closest('label');
      await expect(Math.round(label?.getBoundingClientRect().height ?? 0)).toBe(72);
    }

    await expectNoHorizontalScroll();
  },
};
