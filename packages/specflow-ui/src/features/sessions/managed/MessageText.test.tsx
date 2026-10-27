// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ContentPage, TextPreview } from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';
import { ReadableText } from './MessageText';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);
const value = (revision: string): TextPreview => ({
  text: 'Preview ' + revision,
  complete: false,
  content: { contentId: '88cb22cb-98ed-4fdb-8712-fd250e128938', revision, byteLength: 200 },
});
const page = (revision: string, offset = 0): ContentPage => ({
  contentId: value(revision).content!.contentId,
  revision,
  offset,
  text: 'Page ' + revision + ':' + offset,
  complete: false,
  nextOffset: offset + 10,
});

it('drops loaded pages and pagination when the same content receives a new revision', async () => {
  const content = vi
    .fn<ManagedSessionsApi['content']>()
    .mockImplementation((_id, ref, offset) => Promise.resolve(page(ref.revision, offset)));
  const api = { content } as unknown as ManagedSessionsApi;
  const view = render(
    <StrictMode>
      <ReadableText api={api} sessionId="session" value={value('100')} />
    </StrictMode>,
  );
  expect(screen.getByText('Preview 100')).toBeTruthy();
  fireEvent.click(screen.getByText('managedSession.readMore'));
  await screen.findByText('Page 100:0');
  fireEvent.click(screen.getByText('managedSession.next'));
  await screen.findByText('Page 100:10');
  view.rerender(
    <StrictMode>
      <ReadableText api={api} sessionId="session" value={value('200')} />
    </StrictMode>,
  );
  expect(screen.getByText('Preview 200')).toBeTruthy();
  expect(screen.queryByText('managedSession.previous')).toBeNull();
  fireEvent.click(screen.getByText('managedSession.readMore'));
  await screen.findByText('Page 200:0');
  fireEvent.click(screen.getByText('managedSession.next'));
  await screen.findByText('Page 200:10');
  expect(content.mock.calls.at(-1)?.[1].revision).toBe('200');
});

it('ignores an old revision response even if the transport ignores cancellation', async () => {
  let finish!: (result: ContentPage) => void;
  const content = vi.fn(
    () =>
      new Promise<ContentPage>((resolve) => {
        finish = resolve;
      }),
  );
  const api = { content } as unknown as ManagedSessionsApi;
  const view = render(<ReadableText api={api} sessionId="session" value={value('100')} />);
  fireEvent.click(screen.getByText('managedSession.readMore'));
  view.rerender(<ReadableText api={api} sessionId="session" value={value('200')} />);
  await act(() => Promise.resolve(finish(page('100'))));
  expect(screen.getByText('Preview 200')).toBeTruthy();
  expect(screen.queryByText('Page 100:0')).toBeNull();
});
