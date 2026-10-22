import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { browserPage } from '../../test-support/browserPage';
import { ConnectedApplication } from './ConnectedConsistency.stories';
import { withLocale } from '../../i18n/StoryLocalization';

const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Review/Owner V5 independent responsive review',
  component: ConnectedApplication,
  parameters: { layout: 'fullscreen' },
  tags: ['contract', 'visual'],
} satisfies Meta<typeof ConnectedApplication>;
export default meta;
type Story = StoryObj<typeof meta>;

async function stable(width: number, height = 900) {
  await (await browserPage()).viewport(width, height);
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  await waitFor(() => {
    for (const surface of document.querySelectorAll<HTMLElement>('[data-workspace-surface]')) {
      if (surface.dataset.workspaceMotion && surface.dataset.workspaceMotion !== 'idle') {
        throw new Error('Workspace motion pending');
      }
    }
  });
}
async function capture(name: string, width: number, height = 900) {
  await stable(width, height);
  console.info(
    'OWNER_V5_INDEPENDENT_REVIEW',
    JSON.stringify({
      name,
      width,
      height,
      cssZoom: getComputedStyle(document.body).zoom,
      innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      controls: [
        ...document.querySelectorAll<HTMLElement>('button, [role="radio"], [role="dialog"]'),
      ]
        .filter((element) => element.getBoundingClientRect().width && !element.closest('[inert]'))
        .map((element) => ({
          name: element.getAttribute('aria-label') ?? element.textContent?.trim(),
          rect: element.getBoundingClientRect().toJSON() as Record<string, number>,
        })),
    }),
  );
}

export const LongIdentity360430: Story = {
  args: { longFilename: true },
  play: async ({ canvas, parameters }) => {
    const name = 'architecture-decisions-and-client-authentication-interview.md';
    // The document opens in Preview; the single header title identifies it.
    await canvas.findByRole('heading', { name }, { timeout: 5000 });
    try {
      for (const width of [360, 430]) {
        await stable(width);
        // Narrowing re-mounts the stacked document surface, which slides in after the viewport
        // change; assert the settled geometry rather than a frame of the entering motion.
        await waitFor(
          () => {
            const box = canvas.getByRole('heading', { name }).getBoundingClientRect();
            if (box.left < 0 || box.right > width) throw new Error(`Title outside ${width}px`);
            if (document.documentElement.scrollWidth > width) throw new Error('Page overflows');
          },
          { timeout: 5000 },
        );
        await stable(width);
        await capture('long-identity', width);
      }
      if (parameters.cssProbe) {
        document.body.style.zoom = '2';
        await capture('css-magnification-200-long-identity', 860, 1200);
      }
    } finally {
      document.body.style.zoom = '';
    }
  },
};

export const GuardAt360430: Story = {
  args: { path: '/specs/new?collection=current' },
  play: async ({ canvas, userEvent, parameters }) => {
    await stable(360);
    await userEvent.click(await canvas.findByRole('button', { name: /Samodzielnie/ }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa specyfikacji' }),
      'Długi opis eksportu danych klienta',
    );
    await userEvent.click(canvas.getByRole('button', { name: /Otwórz nawigację|Open navigation/ }));
    const drawer = await within(document.body).findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('link', { name: 'Specyfikacje' }));
    await within(document.body).findByRole('button', { name: 'Kontynuuj' });
    try {
      for (const width of [360, 430]) {
        await capture('guard', width);
        const safeBox = within(document.body)
          .getByRole('button', { name: 'Kontynuuj' })
          .getBoundingClientRect();
        const dangerBox = within(document.body)
          .getByRole('button', { name: 'Porzuć konfigurację' })
          .getBoundingClientRect();
        await expect(safeBox.left).toBeGreaterThanOrEqual(0);
        await expect(dangerBox.right).toBeLessThanOrEqual(width);
      }
      if (parameters.cssProbe) {
        document.body.style.zoom = '2';
        await capture('css-magnification-200-guard', 860, 1200);
      }
      await expect(within(document.body).getByRole('button', { name: 'Kontynuuj' })).toHaveFocus();
      await userEvent.keyboard('{Escape}');
      await waitFor(() =>
        expect(within(document.body).getByRole('link', { name: 'Specyfikacje' })).toHaveFocus(),
      );
    } finally {
      document.body.style.zoom = '';
    }
  },
};

// Diagnostic captures only: body CSS zoom retains unzoomed viewport units and
// media queries, so it is not evidence of actual browser zoom accessibility.
export const CssMagnificationDocumentDiagnostic: Story = {
  ...LongIdentity360430,
  tags: ['capture'],
  parameters: { cssProbe: true },
};
export const CssMagnificationGuardDiagnostic: Story = {
  ...GuardAt360430,
  tags: ['capture'],
  parameters: { cssProbe: true },
};
