// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { installWorkspaceWidth } from '../../../test-support/workspaceWidth.test-support';
import { ManagedSession } from './ManagedSession';
import { fixtureSessionId } from './managedSession.stories-support';
import { longConversationSnapshot } from './managedSession.fullSession.stories-support';
import { liveFixtureApi, nextAnswer } from './managedSession.liveFeed.stories-support';

/**
 * Controlled scroll geometry for the conversation scroller (jsdom has no layout): every rendered
 * entry is `ENTRY_PX` tall, stacked from the scroller's top edge, and the scroller's `scrollTop`
 * is clamped to its scrollable range like a browser's. Only the reader's gestures dispatch `scroll`.
 */
const ENTRY_PX = 100;
const CLIENT_PX = 800;

function installConversationGeometry() {
  const scroller = document.querySelector<HTMLElement>('[data-session-scroller]');
  if (!scroller) {
    throw new Error('Expected the conversation scroll owner.');
  }

  const entries = () => [...scroller.querySelectorAll<HTMLElement>('[data-entry-id]')];
  const scrollHeight = () => entries().length * ENTRY_PX + 200;
  let top = 0;
  Object.defineProperties(scroller, {
    scrollHeight: { configurable: true, get: scrollHeight },
    clientHeight: { configurable: true, get: () => CLIENT_PX },
    scrollTop: {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = Math.min(Math.max(0, value), scrollHeight() - CLIENT_PX);
      },
    },
  });
  const rect = (y: number, height: number) =>
    ({
      x: 0,
      y,
      top: y,
      left: 0,
      right: 1000,
      bottom: y + height,
      width: 1000,
      height,
      toJSON: () => ({}),
    }) as DOMRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === scroller) {
      return rect(0, CLIENT_PX);
    }

    const index = entries().indexOf(this);

    return index >= 0 ? rect(index * ENTRY_PX - top, ENTRY_PX) : rect(0, 0);
  });

  return {
    scroller,
    /** The reader's own gesture: moves and reports it, like a wheel or touch scroll. */
    scrollTo(value: number) {
      scroller.scrollTop = value;
      scroller.dispatchEvent(new Event('scroll'));
    },
    distanceFromBottom: () => scrollHeight() - CLIENT_PX - top,
  };
}

/** Lets the live stream deliver and React commit what it delivered, without running any timer. */
const deliver = () =>
  act(async () => {
    for (let index = 0; index < 20; index += 1) {
      await Promise.resolve();
    }
  });

const latestPill = () => screen.queryByRole('button', { name: 'Return to latest messages' });

beforeEach(() => {
  Element.prototype.scrollIntoView = () => undefined;
  window.scrollTo = () => undefined;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
    onchange: null,
  }));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderLongConversation() {
  const snapshot = longConversationSnapshot();
  const live = liveFixtureApi(snapshot);
  installWorkspaceWidth(1400);
  render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AppShell navigation={<div>Navigation</div>}>
          <AppWorkspaceProvider>
            <ManagedSession sessionId={fixtureSessionId} owner="scroll-owner" api={live.api} />
          </AppWorkspaceProvider>
        </AppShell>
      </QueryClientProvider>
    </LocalizationProvider>,
  );
  await waitFor(() =>
    expect(document.querySelectorAll('[data-entry-id]').length).toBeGreaterThan(20),
  );
  await act(() => live.watched());
  const geometry = installConversationGeometry();
  // Following the latest message, as on arrival.
  geometry.scrollTo(geometry.scroller.scrollHeight);

  return { snapshot, live, geometry };
}

describe('N02 the conversation keeps the reader’s position', () => {
  it('a new message that lands before "away" has settled does not pull the reader to the bottom', async () => {
    const { snapshot, live, geometry } = await renderLongConversation();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    geometry.scrollTo(1500);
    live.push(nextAnswer(snapshot, 1, 'A new answer while reading.'));
    await deliver();

    expect(screen.getByText('A new answer while reading.')).toBeTruthy();
    expect(geometry.scroller.scrollTop).toBe(1500);
    expect(latestPill()).toBeNull();

    // The settled verdict follows 100 ms later; the reader is still where they were.
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(latestPill()).not.toBeNull();
    expect(geometry.scroller.scrollTop).toBe(1500);
  });

  it('a reader following the latest message stays pinned as new messages arrive', async () => {
    const { snapshot, live, geometry } = await renderLongConversation();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    live.push(nextAnswer(snapshot, 1, 'A new answer at the bottom.'));
    await deliver();

    expect(screen.getByText('A new answer at the bottom.')).toBeTruthy();
    expect(geometry.distanceFromBottom()).toBe(0);
  });
});
