// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  utf8Bytes,
  type ContentPage,
  type ContentRef,
  type TextPreview,
} from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';
import { ReadableText, type ReadableTextHandle } from './MessageText';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

const contentId = '88cb22cb-98ed-4fdb-8712-fd250e128938';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A fake with the real Runtime's semantics (`persistence/content.ts`): the preview is the first
 * (at most) 2048 bytes of the content, cut on a character boundary; `offset` counts UTF-8 bytes
 * from the start of the FULL content; a page is the longest valid UTF-8 prefix within the budget.
 */
function runtimeContent(full: string, pageBytes = 4096) {
  const bytes = encoder.encode(full);
  const revision = String(bytes.length);
  const boundary = (at: number) => {
    let end = Math.min(at, bytes.length);
    while (end > 0 && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
      end -= 1;
    }

    return end;
  };

  const previewEnd = boundary(2048);
  const preview: TextPreview = {
    text: decoder.decode(bytes.subarray(0, previewEnd)),
    complete: bytes.length <= 2048,
    content: { contentId, revision, byteLength: bytes.length },
  };
  const content = vi.fn<ManagedSessionsApi['content']>().mockImplementation((_id, _ref, offset) => {
    if ((bytes[offset]! & 0xc0) === 0x80) {
      return Promise.reject(new Error('Offset must be a UTF-8 boundary.'));
    }

    const end = boundary(offset + pageBytes);
    const next = offset + (end - offset);

    return Promise.resolve({
      contentId,
      revision,
      offset,
      text: decoder.decode(bytes.subarray(offset, end)),
      complete: next === bytes.length,
      nextOffset: next < bytes.length ? next : undefined,
    });
  });

  return { preview, content, api: { content } as unknown as ManagedSessionsApi };
}

/** Byte length of every `value()` preview: the first content offset the UI must request. */
const start = 12;
const value = (revision: string): TextPreview => ({
  text: 'Preview ' + revision + ':',
  complete: false,
  content: { contentId, revision, byteLength: 200 },
});
const page = (revision: string, offset: number, nextOffset?: number): ContentPage => ({
  contentId,
  revision,
  offset,
  text: 'Page ' + revision + ':' + (offset - start) + ' ',
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
        offset === start
          ? page(ref.revision, start, start + 1)
          : offset === start + 1
            ? page(ref.revision, start + 1, start + 2)
            : page(ref.revision, start + 2, undefined),
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
    if (offset === start + 1 && failPending) {
      failPending = false;

      return Promise.reject(new Error('network error'));
    }

    return Promise.resolve(
      offset === start
        ? page(ref.revision, start, start + 1)
        : page(ref.revision, start + 1, undefined),
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
    if (offset === start) {
      return Promise.resolve(page(ref.revision, start, start + 1));
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
  expect(() => resolveSecond(page('100', start + 1, undefined))).not.toThrow();
  await act(() => Promise.resolve());
  expect(content).toHaveBeenCalledTimes(2);
});

it('renders a large message exactly once: the preview is the content prefix and the first read continues at its byte length', async () => {
  const full = 'Początek wiadomości. ' + 'Zażółć gęślą jaźń. '.repeat(400) + 'Koniec.';
  const { preview, content, api } = runtimeContent(full);
  expect(preview.complete).toBe(false);
  render(<ReadableText api={api} sessionId="session" value={preview} />);
  await screen.findByText(/Koniec\.$/);
  expect(content.mock.calls[0]?.[2]).toBe(utf8Bytes(preview.text));
  expect(document.querySelector('p')?.textContent).toBe(full);
});

it.each([0, 1, 2, 3])(
  'keeps the text exact when a multi-byte character straddles the 2048-byte preview boundary (shift %i)',
  async (shift) => {
    // 'ą' is two bytes, '😀' four: with the padding shifted, the boundary falls inside each of them.
    const full = 'a'.repeat(2046 + shift) + 'ąą😀ł'.repeat(900) + ' koniec';
    const { preview, content, api } = runtimeContent(full, 1000);
    expect(utf8Bytes(preview.text)).toBeLessThanOrEqual(2048);
    render(<ReadableText api={api} sessionId="session" value={preview} />);
    await screen.findByText(/ koniec$/);
    expect(content.mock.calls[0]?.[2]).toBe(utf8Bytes(preview.text));
    expect(document.querySelector('p')?.textContent).toBe(full);
  },
);

it('stops with the failed state when the next cursor does not advance', async () => {
  const content = vi
    .fn<ManagedSessionsApi['content']>()
    .mockImplementation((_id, ref, offset) => Promise.resolve(page(ref.revision, offset, offset)));
  const api = { content } as unknown as ManagedSessionsApi;
  render(<ReadableText api={api} sessionId="session" value={value('100')} />);
  await screen.findByText('managedSession.failed');
  expect(content).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert')).toBeTruthy();
});

it('never shows a rejected page, and retry resumes from the last valid offset without duplicating text', async () => {
  let broken = true;
  const content = vi.fn<ManagedSessionsApi['content']>().mockImplementation((_id, ref, offset) => {
    if (offset === start) {
      return Promise.resolve(page(ref.revision, start, start + 1));
    }

    return Promise.resolve(
      broken ? page(ref.revision, offset, offset) : page(ref.revision, offset, undefined),
    );
  });
  const api = { content } as unknown as ManagedSessionsApi;
  render(<ReadableText api={api} sessionId="session" value={value('100')} />);
  await screen.findByText('managedSession.failed');
  // The valid first page is shown; the non-advancing second page never reached the text.
  expect(document.querySelector('p')?.textContent).toBe('Preview 100:Page 100:0 ');
  broken = false;
  fireEvent.click(screen.getByText('common.retry'));
  await waitFor(() => expect(screen.queryByText('managedSession.failed')).toBeNull());
  await waitFor(() =>
    expect(document.querySelector('p')?.textContent).toBe('Preview 100:Page 100:0 Page 100:1 '),
  );
  expect(content.mock.calls.map((call) => call[2])).toEqual([start, start + 1, start + 1]);
});

it.each([
  ['another offset', (ref: ContentRef) => ({ ...page(ref.revision, start + 5, undefined) })],
  ['another revision', () => page('other', start, undefined)],
])('rejects a page that answers %s without showing it', async (_name, bad) => {
  const content = vi
    .fn<ManagedSessionsApi['content']>()
    .mockImplementation((_id, ref) => Promise.resolve(bad(ref)));
  const api = { content } as unknown as ManagedSessionsApi;
  render(<ReadableText api={api} sessionId="session" value={value('100')} />);
  await screen.findByText('managedSession.failed');
  expect(document.querySelector('p')?.textContent).toBe('Preview 100:');
});

function withClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

  return writeText;
}

it('copy reports failure and writes nothing while the rest is loading, then copies the complete text', async () => {
  const writeText = withClipboard();
  let release!: (result: ContentPage) => void;
  const content = vi.fn<ManagedSessionsApi['content']>().mockImplementation(
    () =>
      new Promise<ContentPage>((resolve) => {
        release = resolve;
      }),
  );
  const api = { content } as unknown as ManagedSessionsApi;
  const handle = createRef<ReadableTextHandle>();
  render(<ReadableText ref={handle} api={api} sessionId="session" value={value('100')} />);
  await waitFor(() => expect(content).toHaveBeenCalled());
  expect(await handle.current!.copy()).toBe(false);
  expect(writeText).not.toHaveBeenCalled();
  act(() => release(page('100', start, undefined)));
  await screen.findByText('Preview 100:Page 100:0');
  await screen.findByText('Preview 100:Page 100:0');
  expect(await handle.current!.copy()).toBe(true);
  expect(writeText).toHaveBeenCalledWith('Preview 100:Page 100:0 ');
});

it('copy reports failure after the load failed', async () => {
  const writeText = withClipboard();
  const content = vi.fn<ManagedSessionsApi['content']>().mockRejectedValue(new Error('offline'));
  const api = { content } as unknown as ManagedSessionsApi;
  const handle = createRef<ReadableTextHandle>();
  render(<ReadableText ref={handle} api={api} sessionId="session" value={value('100')} />);
  await screen.findByText('managedSession.failed');
  expect(await handle.current!.copy()).toBe(false);
  expect(writeText).not.toHaveBeenCalled();
});
