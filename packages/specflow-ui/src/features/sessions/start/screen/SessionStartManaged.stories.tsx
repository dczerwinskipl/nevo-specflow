import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { withLocale } from '../../../../i18n/StoryLocalization';
import { browserPage } from '../../../../test-support/browserPage';
import { settleViewport } from '../../../../test-support/viewportSettle.stories-support';
import {
  antigravityDescriptor,
  claudeDescriptor,
  codexDescriptor,
  unavailableProviders,
} from '../catalogue/providerDescriptors.stories-support';
import { providerDescriptor } from '../catalogue/startCatalogue.stories-support';
import { creates, ManagedStartPreview } from './sessionStart.stories-support';

/**
 * Starting a Session on the managed Runtime (`/sessions/new`, no Specification): the same Session
 * screen and form as a Specification's, over the Runtime's own provider catalogue (readiness,
 * reasons, native work modes) and `POST /api/sessions`
 * (`docs/ideas/specflow-ui/screens/new-session-ui-spec.md`, scenario (h)). The real start source runs
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

/** Scenario (h): no Specification in Context; the catalogue is the Runtime's own. */
export const NoSpecification: Story = {
  play: async ({ canvas }) => {
    await settle();
    await expect(canvas.getByRole('heading', { level: 1, name: 'Nowa sesja' })).toBeVisible();
    await expect(
      await canvas.findByRole('heading', { level: 2, name: 'Rozpocznij sesję' }),
    ).toBeVisible();
    // The Runtime's own providers, the first available one chosen; Context has no Specification row.
    await expect(canvas.getByRole('radio', { name: /Claude/ })).toBeChecked();
    await expect(canvas.queryByText('Specyfikacja')).toBeNull();
    await expect(canvas.getByText('nie wybrano')).toBeVisible();
    await expect(canvas.getByRole('combobox', { name: 'Model' })).toBeEnabled();
    await expect(canvas.getByRole('combobox', { name: 'Effort' })).toBeDisabled();
    await expect(startButton(canvas)).toBeDisabled();
    await expect(canvas.getByText('Wybierz model.')).toBeVisible();
    await expect(composer(canvas)).toBeDisabled();
  },
};

/** Claude's own native modes: only the usable ones are listed; the catalogue's unavailable one is
 * omitted, with no reason line (session-composer-design.md §7 item 4). */
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

/** Scenario (h): a provider that lists no models shows Model disabled at the provider default. */
export const ProviderWithoutModels: Story = {
  args: {
    defaults: {
      agent: { providerId: 'codex', modelId: '', effort: 'provider-default', mode: 'agent' },
    },
  },
  play: async ({ canvas }) => {
    await settle();
    const model = await canvas.findByRole('combobox', { name: 'Model' });
    await expect(model).toBeDisabled();
    await expect(model).toHaveTextContent('Domyślny wykonawcy');
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

/** Scenario (e): every provider needs attention; each tile says why and nothing can start. */
export const ManagedNoProviderAvailable: Story = {
  args: { providers: unavailableProviders },
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByText('Żaden wykonawca nie jest teraz dostępny.')).toBeVisible();
    await expect(canvas.getByRole('radio', { name: /Claude/ })).toBeDisabled();
    await expect(canvas.getByText('Wymagane ponowne logowanie')).toBeVisible();
    await expect(canvas.getByText(/Zaloguj się ponownie w CLI dostawcy/)).toBeVisible();
    await expect(canvas.getByText('Nie zainstalowano CLI.')).toBeVisible();
    await expect(canvas.getByText('Nie zalogowano do CLI.')).toBeVisible();
    await expect(startButton(canvas)).toBeDisabled();
    // The Runtime is asked again only on request, after signing in.
    await expect(canvas.getByRole('button', { name: 'Spróbuj ponownie' })).toBeEnabled();
    await expect(canvas.getByText('nie wybrano')).toBeVisible();
  },
};

/** A ready provider that can run no work mode is not startable: disabled with its reason. */
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
  play: async ({ canvas }) => {
    await settle();
    await expect(await canvas.findByRole('radio', { name: /Claude/ })).toBeDisabled();
    await expect(canvas.getByRole('radio', { name: /Claude/ })).not.toBeChecked();
    await expect(canvas.getByRole('radio', { name: /Codex/ })).toBeDisabled();
    await expect(canvas.getByText('Wymaga zgody administratora.')).toBeVisible();
    await expect(canvas.getByText('Brak dostępnego trybu pracy')).toBeVisible();
    await expect(canvas.getByText('Żaden wykonawca nie jest teraz dostępny.')).toBeVisible();
    await expect(startButton(canvas)).toBeDisabled();
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
    await expect(composer(canvas)).toBeDisabled();
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
    await userEvent.click(canvas.getByRole('switch', { name: 'Nadaj własną nazwę' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Nazwa sesji' }), 'Przegląd SSO');
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
    await expect(canvas.queryByRole('heading', { name: 'Rozpocznij sesję' })).toBeNull();
    await expect(canvas.getByRole('heading', { level: 1, name: 'Przegląd SSO' })).toBeVisible();
    await waitFor(() => expect(composer(canvas)).toHaveFocus());
    await expect(composer(canvas)).toBeEnabled();
    await expect(canvas.getByRole('button', { name: /Claude Sonnet/ })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /Plan/ })).toBeVisible();
  },
};

/** Narrow 375 px, no Specification: one column, no Composer before Start, Context from the header. */
export const NarrowNoSpecification: Story = {
  globals: mobile,
  play: async ({ canvas }) => {
    await settle(375, 812);
    await expect(
      await canvas.findByRole('heading', { level: 2, name: 'Rozpocznij sesję' }),
    ).toBeVisible();
    await expect(canvas.queryByRole('textbox', { name: 'Wiadomość' })).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Kontekst' })).toBeVisible();
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
