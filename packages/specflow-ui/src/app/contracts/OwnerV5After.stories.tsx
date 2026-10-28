import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within, waitFor } from 'storybook/test';
import { browserPage } from '../../test-support/browserPage';
import { ConnectedApplication, createResponseControl } from './ConnectedConsistency.stories';
import { RoutedApplication } from '../SpecFlowShell.stories';
import secondaryLoadingMeta from '../../../../nevo-ui/src/app/workspace/SecondaryLoading.stories';
import {
  invokeDocumentAction,
  waitForDocumentActions,
} from '../../features/documents/editor/documentHeaderActions.stories-support';
import { withLocale } from '../../i18n/StoryLocalization';

const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Review/Owner V5 after',
  component: ConnectedApplication,
  parameters: { layout: 'fullscreen' },
  tags: ['contract', 'integration', 'visual'],
} satisfies Meta<typeof ConnectedApplication>;
export default meta;
type Story = StoryObj<typeof meta>;
async function frame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
async function settle(width: number, height = 900) {
  await (await browserPage()).viewport(width, height);
  await frame();
  await frame();
  await waitFor(
    async () => {
      const read = () =>
        [...document.querySelectorAll<HTMLElement>('[data-workspace-surface]')].map((element) => ({
          key: element.dataset.workspaceInstance,
          active: element.dataset.workspaceActive,
          x: element.getBoundingClientRect().x,
          width: element.getBoundingClientRect().width,
          motion: element.dataset.workspaceMotion,
        }));
      const first = read();
      if (first.some((item) => item.motion && item.motion !== 'idle'))
        throw new Error('Workspace motion pending');
      await frame();
      await frame();
      const next = read();
      if (JSON.stringify(first) !== JSON.stringify(next))
        throw new Error('Responsive bounds pending');
      const active = document.querySelector<HTMLElement>(
        '[data-workspace-surface="secondary"][data-workspace-active="true"]',
      );
      if (width < 840 && active) {
        const box = active.getBoundingClientRect();
        if (Math.abs(box.x) > 1 || Math.abs(box.right - width) > 1)
          throw new Error('Narrow Secondary bounds pending');
      }
    },
    { timeout: 5000 },
  );
}
function contrast(name: string) {
  const nodes = [...document.querySelectorAll<HTMLElement>('[class*="text-content-"]')].filter(
    (e) => e.textContent?.trim() && e.getBoundingClientRect().height && e.children.length < 2,
  );
  const pairs = nodes.slice(0, 120).map((e) => {
    const style = getComputedStyle(e);
    let parent: HTMLElement | null = e;
    const backgrounds = [];
    while (parent) {
      const color = getComputedStyle(parent).backgroundColor;
      if (color !== 'rgba(0, 0, 0, 0)') backgrounds.push(color);
      parent = parent.parentElement;
    }
    return {
      text: e.textContent?.trim().slice(0, 100),
      color: style.color,
      backgrounds,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      disabled: !!e.closest('[disabled],[aria-disabled="true"]'),
    };
  });
  console.info('OWNER_V5_CONTRAST', JSON.stringify({ name, pairs }));
}
async function shot(name: string, width: number, height = 900) {
  await settle(width, height);
  contrast(name);
  const regions = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-workspace-surface], [data-app-shell-region="workspace"], [data-workspace-header]',
    ),
  ].map((element) => ({
    kind:
      element.dataset.workspaceSurface ??
      (element.hasAttribute('data-workspace-header') ? 'header' : 'workspace'),
    active: element.dataset.workspaceActive,
    rect: element.getBoundingClientRect().toJSON() as Record<string, number>,
  }));
  console.info(
    'OWNER_V5_AFTER',
    JSON.stringify({
      name,
      width,
      height,
      layout: document.querySelector('[data-layout]')?.getAttribute('data-layout'),
      regions,
      documentScroll: document.scrollingElement?.scrollTop,
    }),
  );
}
/** Scrolls the Create form to its end (the submit button is pinned below it). */
function toFormEnd(canvas: {
  getByRole: (role: string, options: { name: string }) => HTMLElement;
}) {
  const scroller = canvas
    .getByRole('textbox', { name: 'Nazwa specyfikacji' })
    .closest<HTMLElement>('.scroll-area-viewport')!;
  scroller.scrollTop = scroller.scrollHeight;
}
export const CreateBottomFailure: Story = {
  args: { path: '/specs/new?collection=current', createOutcome: 'failure' },
  play: async ({ canvas, userEvent }) => {
    await settle(390, 844);
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Eksport CSV',
    );
    const submit = canvas.getByRole('button', { name: 'Utwórz specyfikację' });
    // The submit button is pinned under the form: the owner scrolls the form to its end.
    toFormEnd(canvas);
    await shot('create-bottom-before', 390, 844);
    await userEvent.click(submit);
    await canvas.findByRole('alert');
    await waitFor(() => {
      if (
        canvas.getByRole('button', { name: 'Utwórz specyfikację' }).getBoundingClientRect().bottom >
        844
      )
        throw new Error('CTA not revealed');
    });
    const feedback = canvas.getByRole('alert').getBoundingClientRect(),
      cta = canvas.getByRole('button', { name: 'Utwórz specyfikację' }).getBoundingClientRect();
    console.info(
      'OWNER_V5_CREATE_RESULT',
      JSON.stringify({
        feedback: feedback.toJSON() as Record<string, number>,
        cta: cta.toJSON() as Record<string, number>,
        viewport: 844,
        feedbackVisible: feedback.top >= 56 && feedback.bottom <= 844,
        ctaVisible: cta.top >= 56 && cta.bottom <= 844,
      }),
    );
    await shot('create-bottom-error', 390, 844);
    if (feedback.bottom > 844 || cta.bottom > 844)
      throw new Error(
        'UX01 ' +
          JSON.stringify({
            feedback: feedback.toJSON() as Record<string, number>,
            cta: cta.toJSON() as Record<string, number>,
            viewport: 844,
          }),
      );
  },
};
export const CreateUnknown: Story = {
  args: { path: '/specs/new?collection=current', createOutcome: 'unknown' },
  play: async ({ canvas, userEvent }) => {
    await settle(390, 844);
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Eksport CSV',
    );
    const submit = canvas.getByRole('button', { name: 'Utwórz specyfikację' });
    submit.scrollIntoView({ block: 'end' });
    await userEvent.click(submit);
    await canvas.findByRole('button', { name: 'Sprawdź wynik' });
    await shot('create-bottom-unknown', 390, 844);
  },
};
export const CreatePending: Story = {
  args: { path: '/specs/new?collection=current', createOutcome: 'pending' },
  play: async ({ canvas, userEvent }) => {
    await settle(390, 844);
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Eksport CSV',
    );
    const submit = canvas.getByRole('button', { name: 'Utwórz specyfikację' });
    submit.scrollIntoView({ block: 'end' });
    await userEvent.click(submit);
    await canvas.findByRole('button', { name: 'Przygotowywanie…' });
    await shot('create-pending', 390, 844);
  },
};
export const DocumentsTablet: Story = {
  play: async ({ canvas, userEvent }) => {
    // The active document opens in Preview by default; wait for its toolbar, not the textbox.
    await waitForDocumentActions(canvas);
    for (const width of [839, 840, 1024, 1180, 1280]) await shot('documents-tablet', width);
    await settle(390, 844);
    await userEvent.click(canvas.getByRole('button', { name: 'Wróć do listy dokumentów' }));
    await userEvent.click((await canvas.findAllByRole('button', { name: 'Więcej akcji' }))[0]!);
    await shot('root-menu', 390, 844);
    await userEvent.keyboard('{Escape}');
  },
};
export const RequiredFileMenu: Story = {
  play: async ({ canvas, userEvent }) => {
    await waitForDocumentActions(canvas);
    await settle(390, 844);
    await userEvent.click(canvas.getByRole('button', { name: 'Wróć do listy dokumentów' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Akcje: specification.md' }));
    await shot('required-file-menu', 390, 844);
  },
};
export const OptionalFileMenu: Story = {
  play: async ({ canvas, userEvent }) => {
    await waitForDocumentActions(canvas);
    await settle(390, 844);
    await userEvent.click(canvas.getByRole('button', { name: 'Wróć do listy dokumentów' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Akcje: CLIENT.TXT' }));
    await shot('optional-file-menu', 390, 844);
  },
};
export const OverviewTablet: Story = {
  render: () => <RoutedApplication path="/specs/admission?collection=current" locale="pl" />,
  play: async ({ canvas }) => {
    await canvas.findByRole('heading', {
      name: 'Deterministic admission and execution boundaries',
      level: 1,
    });
    for (const width of [839, 840, 1024, 1180, 1280]) await shot('overview-tablet', width);
  },
};
export const SessionTablet: Story = {
  args: { path: '/specs/api-integration/sessions/session?collection=current' },
  play: async ({ canvas }) => {
    await canvas.findByRole('textbox', { name: 'Wiadomość do Spec Writera' });
    for (const width of [839, 840, 1024, 1180]) await shot('session-tablet', width);
  },
};
export const ProviderAndCapabilities: Story = {
  args: { path: '/specs/new?collection=current' },
  play: async ({ canvas, userEvent }) => {
    await settle(1440, 900);
    await userEvent.click(await canvas.findByRole('button', { name: /Z agentem/ }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Eksport CSV',
    );
    await shot('agent-form', 1440);
    await settle(390, 844);
    await shot('agent-form', 390, 844);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Model' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: 'codex model B' }),
    );
    canvas.getByRole('combobox', { name: 'Model' }).scrollIntoView({ block: 'center' });
    await shot('model-no-effort', 390, 844);
  },
};
export const GuardFromDrawer: Story = {
  args: { path: '/specs/new?collection=current' },
  play: async ({ canvas, userEvent }) => {
    await settle(390, 844);
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Eksport CSV',
    );
    await userEvent.click(canvas.getByRole('button', { name: /Otwórz nawigację|Open navigation/ }));
    const drawer = await within(document.body).findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('link', { name: 'Specyfikacje' }));
    await within(document.body).findByRole('heading', { name: 'Porzucić konfigurację?' });
    console.info(
      'OWNER_V5_GUARD',
      JSON.stringify({
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map((element) => ({
          text: element.textContent,
          ariaModal: element.getAttribute('aria-modal'),
        })),
        activeElement: document.activeElement?.outerHTML,
      }),
    );
    await shot('guard-drawer', 390, 844);
    const safe = within(document.body).getByRole('button', { name: 'Kontynuuj' });
    const top = safe.closest('[role="dialog"], [role="alertdialog"]')!;
    await expect(safe).toHaveFocus();
    for (let i = 0; i < 5; i++) {
      await userEvent.tab();
      await expect(top.contains(document.activeElement)).toBe(true);
    }
    await userEvent.tab({ shift: true });
    await expect(top.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.body.contains(safe)).toBe(false));
    const origin = within(document.body).getByRole('link', { name: 'Specyfikacje' });
    await expect(origin).toHaveFocus();
    await userEvent.click(origin);
    await within(document.body).findByRole('button', { name: 'Porzuć konfigurację' });
    await userEvent.click(
      within(document.body).getByRole('button', { name: 'Porzuć konfigurację' }),
    );
    await canvas.findByRole('heading', { name: 'Specyfikacje', level: 1 });
    await expect(within(document.body).queryByRole('dialog')).not.toBeInTheDocument();
    await expect(within(document.body).queryByRole('alertdialog')).not.toBeInTheDocument();
  },
};
const Loading = secondaryLoadingMeta.component;
export const SharedLoading: Story = {
  render: () => <Loading mode="fallback" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open pending detail' }));
    await canvas.findByText('Loading…');
    for (const width of [840, 1024, 1180]) await shot('shared-loading', width);
  },
};
export const SharedNullLoading: Story = {
  render: () => <Loading mode="null" />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open pending detail' }));
    await canvas.findByText('Pending detail');
    for (const width of [840, 1024, 1180]) await shot('shared-null-loading', width);
  },
};

export const GlobalSpecsOverviewTablet: Story = {
  render: () => <RoutedApplication path="/?collection=current" locale="pl" />,
  play: async ({ canvas }) => {
    await canvas.findByRole('heading', { name: 'Specyfikacje', level: 1 });
    for (const width of [839, 840, 1024, 1180]) await shot('global-overview-tablet', width);
  },
};

export const ResponsiveModeFocus: Story = {
  play: async ({ canvas, userEvent }) => {
    // The document opens in Preview by default, with the same icon-only toggle at every width
    // (no segmented control / compact-mode measurement).
    await settle(390, 844);
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Treść specification.md' }), ' draft');
    await settle(320, 844);
    await invokeDocumentAction(canvas, userEvent, 'Pokaż podgląd');
    // The toggle may be replaced by another action, so focus moves into the document content.
    const content = () => document.querySelector('[data-document-preview]');
    await waitFor(() => expect(document.activeElement).toBe(content()));
    await settle(390, 844);
    await waitFor(() => expect(document.activeElement).toBe(content()));
    await shot('preview-toolbar', 390, 844);
    await invokeDocumentAction(canvas, userEvent, 'Edytuj dokument');
    await expect(canvas.getByRole('textbox', { name: 'Treść specification.md' })).toHaveTextContent(
      'draft',
    );
    await userEvent.type(canvas.getByRole('textbox', { name: 'Treść specification.md' }), ' draft');
    await shot('dirty-toolbar', 320, 844);
  },
};
export const ExplicitModeFallback: Story = {
  args: { path: '/specs/new?collection=current' },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('button', { name: /Z agentem/ });
    await userEvent.click(canvas.getByRole('button', { name: /Z agentem/ }));
    await expect(canvas.queryByText('Tryb pracy')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('radio', { name: /Claude/ }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Model' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: 'claude model B' }),
    );
    await expect(canvas.queryByRole('combobox', { name: 'Effort' })).not.toBeInTheDocument();
    // Claude model B supports Ask and Edit only: no dead Agent segment, and the first
    // supported mode is selected when the previous mode is not supported.
    await expect(canvas.queryByRole('radio', { name: 'Agent' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('radio', { name: 'Ask' })).toBeChecked();
    await expect(canvas.getByRole('radio', { name: 'Edit' })).not.toBeChecked();
    await userEvent.click(canvas.getByRole('radio', { name: 'Edit' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Model' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: 'claude model A' }),
    );
    await expect(canvas.getByRole('radio', { name: 'Edit' })).toBeChecked();
  },
};

export const DeferredFailureKeepsReadingPosition: Story = {
  args: { path: '/specs/new?collection=current', createOutcome: 'deferred-failure' },
  play: async ({ canvas, userEvent }) => {
    await settle(390, 844);
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    const title = canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' });
    await userEvent.type(title, 'Eksport CSV');
    const submit = canvas.getByRole('button', { name: 'Utwórz specyfikację' });
    submit.scrollIntoView({ block: 'end' });
    await userEvent.click(submit);
    await canvas.findByRole('button', { name: 'Przygotowywanie…' });
    // The submit button is pinned under the form; the form itself scrolls.
    const scroller = title.closest<HTMLElement>('.scroll-area-viewport')!;
    scroller.scrollTop = 0;
    await frame();
    const position = scroller.scrollTop;
    createResponseControl.fail();
    await canvas.findByRole('alert');
    await frame();
    await frame();
    await expect(scroller.scrollTop).toBe(position);
    await expect(title).toHaveValue('Eksport CSV');
    await shot('error-user-reading-title', 390, 844);
  },
};
export const OversizeFeedbackInShortViewport: Story = {
  args: { path: '/specs/new?collection=current', createOutcome: 'failure' },
  play: async ({ canvas, userEvent }) => {
    await settle(390, 210);
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Eksport CSV',
    );
    const submit = canvas.getByRole('button', { name: 'Utwórz specyfikację' });
    toFormEnd(canvas);
    await userEvent.click(submit);
    const alert = await canvas.findByRole('alert');
    // The failure is explained at the end of the scrolling form, above the pinned footer.
    const region = alert.parentElement!,
      scroller = alert.closest<HTMLElement>('.scroll-area-viewport')!;
    await expect(scroller.contains(submit)).toBe(false);
    await expect(region.offsetHeight).toBeGreaterThan(scroller.clientHeight);
    await waitFor(() =>
      expect(alert.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        scroller.getBoundingClientRect().top,
      ),
    );
    await shot('oversize-feedback-start', 390, 210);
    submit.scrollIntoView({ block: 'end' });
    await frame();
    await expect(submit.getBoundingClientRect().bottom).toBeLessThanOrEqual(210);
    await shot('oversize-feedback-retry', 390, 210);
  },
};
