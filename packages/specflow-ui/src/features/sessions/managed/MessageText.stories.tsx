import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, fn, waitFor } from 'storybook/test';
import { useTranslation } from 'react-i18next';
import { Button } from '@nevo/ui';
import type { TextPreview } from '@nevo/specflow-contracts/sessions';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { ReadableText, type ReadableTextHandle } from './MessageText';
import { fixtureApi, fixtureSessionId, sessionFixture } from './managedSession.stories-support';

/**
 * Component-level stories for `ReadableText` (`MessageText.tsx`): the one owner of a message's
 * fully resolved text (initial preview plus every auto-stitched page) and of the imperative Copy
 * handle `ManagedSession.tsx`'s `EntryRow`/`MessageCopyAction` act on. Mounts `ReadableText`
 * directly — no `AppShell`/`AppWorkspace`/`ManagedSession` screen around it — with a minimal mock
 * `api` (only its `content()` method is ever called) and a plain `TextPreview` value, matching
 * what the component itself actually needs.
 *
 * Previously this behavior (notably the Copy action, item 4 of session-chat-v10-design.md §2) was
 * only proven by `CopyMessage` in `ManagedSession.interactions.stories.tsx`, which mounted the
 * *entire* `ManagedSession` screen just to reach one small element — the wrong level of story for
 * what it was actually testing (owner feedback). `CopyMessage` has been removed now that this
 * file covers the same ground at the right level.
 */

/**
 * The thinnest possible harness around `ReadableText`'s own imperative Copy handle: a ref plus a
 * Copy button, exactly the shape `EntryRow`/`MessageCopyAction` wire up in `ManagedSession.tsx`
 * (`textRef` + `handleCopy`), without that component's hover-reveal chrome or icon swap — those
 * are `ManagedSession`-specific presentation, not part of `ReadableText`'s own contract.
 */
function ReadableTextHarness({ value, markdown }: { value: TextPreview; markdown?: boolean }) {
  const { t } = useTranslation();
  const ref = useRef<ReadableTextHandle>(null);
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  return (
    <div className="grid max-w-prose gap-3 p-4">
      <ReadableText
        ref={ref}
        api={fixtureApi(sessionFixture())}
        sessionId={fixtureSessionId}
        value={value}
        markdown={markdown}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void ref.current?.copy().then((ok) => setStatus(ok ? 'copied' : 'failed'));
          }}
        >
          {t('managedSession.copy.action')}
        </Button>
        <span role="status" aria-live="polite" className="text-body-sm text-content-muted">
          {status === 'copied'
            ? t('managedSession.copy.copied')
            : status === 'failed'
              ? t('managedSession.copy.failed')
              : ''}
        </span>
      </div>
    </div>
  );
}

const meta = {
  title: 'SpecFlow/Components/MessageText',
  component: ReadableTextHarness,
  decorators: [
    (Story) => (
      <StoryLocalization locale="pl">
        <Story />
      </StoryLocalization>
    ),
  ],
} satisfies Meta<typeof ReadableTextHarness>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A short, already-`complete` preview: no auto-stitch fetch sequence ever starts. */
export const ShortCompleteText: Story = {
  args: {
    value: { text: 'Krótka, kompletna odpowiedź bez dalszych stron.', complete: true },
  },
};

/**
 * A capped preview (`complete: false`) whose remaining pages are fetched and stitched in
 * automatically, with no "read more"/"previous"/"next" controls — mirrors `Tail` in
 * `ManagedSession.interactions.stories.tsx`, at the component level.
 */
export const AutoStitchedLongText: Story = {
  args: { value: sessionFixture(true).entries[1]!.text },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/jedna całość\.$/, undefined, { timeout: 5000 }),
    ).toBeVisible();
    await expect(
      canvas.queryByText(/Czytaj dalej|Poprzedni fragment|Następny fragment/),
    ).toBeNull();
  },
};

/**
 * Item 4 (session-chat-v10-design.md §2): Copy acts on the full resolved text — every
 * auto-stitched page included — not just the capped initial preview. The same clipboard-mocking
 * approach the removed screen-level `CopyMessage` story used.
 */
export const Copy: Story = {
  args: { value: sessionFixture(true).entries[1]!.text },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/jedna całość\.$/, undefined, { timeout: 5000 }),
    ).toBeVisible();
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      await userEvent.click(await canvas.findByRole('button', { name: 'Kopiuj wiadomość' }));
      await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      const copied = writeText.mock.calls[0]?.[0] as string;
      await expect(copied.startsWith('To jest krótki podgląd dużej odpowiedzi.')).toBe(true);
      await expect(copied.endsWith('jedna całość.')).toBe(true);
      await canvas.findByText('Skopiowano');
    } finally {
      if (descriptor) {
        Object.defineProperty(navigator, 'clipboard', descriptor);
      } else {
        Reflect.deleteProperty(navigator, 'clipboard');
      }
    }
  },
};
