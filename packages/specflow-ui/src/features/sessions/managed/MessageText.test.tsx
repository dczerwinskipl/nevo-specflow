// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ContentPage, TextPreview } from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';
import { ReadableText } from './MessageText';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

const contentId = '88cb22cb-98ed-4fdb-8712-fd250e128938';
const value = (revision: string): TextPreview => ({
  text: 'Preview ' + revision + ':',
  complete: false,
  content: { contentId, revision, byteLength: 200 },
});
const page = (revision: string, offset: number, nextOffset?: number): ContentPage => ({
  contentId,
  revision,
  offset,
  text: 'Page ' + revision + ':' + offset + ' ',
  complete: nextOffset === undefined,
  nextOffset,
});

it('renders a complete preview as-is and never calls content()', () => {
  const content = vi.fn<ManagedSessionsApi['content']>();
  const api = { content } as unknown as ManagedSessionsApi;
  render(
    <ReadableText
      api={api}
      sessionId="session"
      value={{ text: 'Short answer.', complete: true }}
    />,
  );
  expect(screen.getByText('Short answer.')).toBeTruthy();
  expect(content).not.toHaveBeenCalled();
});

it('auto-fetches every remaining page of a large message and renders it as one block with no pagination controls', async () => {
  const content = vi
    .fn<ManagedSessionsApi['content']>()
    .mockImplementation((_id, ref, offset) =>
      Promise.resolve(
        offset === 0
          ? page(ref.revision, 0, 1)
          : offset === 1
            ? page(ref.revision, 1, 2)
            : page(ref.revision, 2, undefined),
      ),
    );
  const api = { content } as unknown as ManagedSessionsApi;
  // Not StrictMode: React's dev-only double-invoke of effects would make this component kick
  // off (and then correctly abort) one extra, discarded fetch sequence, which is irrelevant to
  // user-visible behaviour but would make the exact call count below flaky to assert.
  render(<ReadableText api={api} sessionId="session" value={value('100')} />);
  await screen.findByText('Preview 100:Page 100:0 Page 100:1 Page 100:2');
  expect(content).toHaveBeenCalledTimes(3);
  expect(screen.queryByText('managedSession.readMore')).toBeNull();
  expect(screen.queryByText('managedSession.previous')).toBeNull();
  expect(screen.queryByText('managedSession.next')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it('drops fetched text and pagination state and starts a fresh fetch when the same content receives a new revision', async () => {
  const content = vi
    .fn<ManagedSessionsApi['content']>()
    .mockImplementation((_id, ref, offset) =>
      Promise.resolve(page(ref.revision, offset, undefined)),
    );
  const api = { content } as unknown as ManagedSessionsApi;
  const view = render(
    <StrictMode>
      <ReadableText api={api} sessionId="session" value={value('100')} />
    </StrictMode>,
  );
  await screen.findByText('Preview 100:Page 100:0');
  view.rerender(
    <StrictMode>
      <ReadableText api={api} sessionId="session" value={value('200')} />
    </StrictMode>,
  );
  await screen.findByText('Preview 200:Page 200:0');
  expect(screen.queryByText('Preview 100:Page 100:0')).toBeNull();
  expect(content.mock.calls.at(-1)?.[1].revision).toBe('200');
});

it('surfaces a single retry affordance when a page fetch fails partway through, and retrying resumes from the failed page', async () => {
  let failPending = true;
  const content = vi.fn<ManagedSessionsApi['content']>().mockImplementation((_id, ref, offset) => {
    if (offset === 1 && failPending) {
      failPending = false;

      return Promise.reject(new Error('network error'));
    }

    return Promise.resolve(
      offset === 0 ? page(ref.revision, 0, 1) : page(ref.revision, 1, undefined),
    );
  });
  const api = { content } as unknown as ManagedSessionsApi;
  render(<ReadableText api={api} sessionId="session" value={value('100')} />);
  await screen.findByText('managedSession.failed');
  await screen.findByText('common.retry');
  expect(screen.getByText('Preview 100:Page 100:0')).toBeTruthy();
  fireEvent.click(screen.getByText('common.retry'));
  await waitFor(() => expect(screen.queryByText('managedSession.failed')).toBeNull());
  await screen.findByText('Preview 100:Page 100:0 Page 100:1');
  expect(content).toHaveBeenCalledTimes(3);
});

it('does not update state after unmounting mid-fetch, and does not fetch further pages once unmounted', async () => {
  let resolveSecond!: (result: ContentPage) => void;
  let secondCalls = 0;
  const content = vi.fn<ManagedSessionsApi['content']>().mockImplementation((_id, ref, offset) => {
    if (offset === 0) {
      return Promise.resolve(page(ref.revision, 0, 1));
    }

    secondCalls += 1;

    return new Promise<ContentPage>((resolve) => {
      resolveSecond = resolve;
    });
  });
  const api = { content } as unknown as ManagedSessionsApi;
  const view = render(<ReadableText api={api} sessionId="session" value={value('100')} />);
  await waitFor(() => expect(secondCalls).toBe(1));
  view.unmount();
  expect(() => resolveSecond(page('100', 1, undefined))).not.toThrow();
  await act(() => Promise.resolve());
  expect(content).toHaveBeenCalledTimes(2);
});
