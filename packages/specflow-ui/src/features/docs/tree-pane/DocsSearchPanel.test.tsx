// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocsSearch } from '@nevo/specflow-contracts/docs';
import { appI18n } from '../../../i18n';
import { DocsSearchPanel } from './DocsSearchPanel';

/** The answers the mocked read hands out, by workspace and text; a missing one is still loading. */
let answers: Record<string, WorkspaceDocsSearch | 'failed'> = {};

vi.mock('../read-model', () => ({
  useDocsSearch: (workspaceId: string | undefined, query: { q: string }) => {
    const answer = workspaceId && query.q ? answers[`${workspaceId}:${query.q}`] : undefined;

    return {
      isSuccess: answer !== undefined && answer !== 'failed',
      isError: answer === 'failed',
      isFetching: answer === undefined && workspaceId !== undefined && query.q !== '',
      data: answer === 'failed' ? undefined : answer,
      refetch: () => Promise.resolve(),
    };
  },
}));

const answer = (workspaceId: string, titles: string[]): WorkspaceDocsSearch => ({
  mode: 'hybrid',
  workspaceId,
  corpusRevision: 'rev',
  results: titles.map((title) => ({
    id: title,
    title,
    type: 'reference',
    status: 'current',
    file: `${title}.md`,
    score: 1,
    wordMatch: true,
    sections: [
      {
        headingPath: ['Overview'],
        sectionId: 'overview',
        line: 3,
        score: 1,
        snippet: 'A Session represents a provider-backed context.',
        snippetMatches: [{ start: 2, end: 9 }],
      },
    ],
  })),
  proposalsLeftOut: 0,
  skipped: [],
});

function Panel({ workspaceId }: { workspaceId: string }) {
  return (
    <DocsSearchPanel workspaceId={workspaceId} proposals={new Set()} onOpen={() => undefined}>
      <p>tree</p>
    </DocsSearchPanel>
  );
}

const type = (text: string) => {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: text } });
  // The search runs once typing pauses.
  act(() => {
    vi.advanceTimersByTime(250);
  });
};

const live = () => screen.getByRole('status').textContent;
// What is on screen, apart from the hidden live region.
const onScreen = { ignore: '[role="status"], script, style' };
const visible = (text: string) => screen.getByText(text, onScreen);
const absent = (text: string) => expect(screen.queryByText(text, onScreen)).toBeNull();
const results = () => screen.queryByRole('region', { name: 'Search results' });

beforeAll(async () => {
  await appI18n.changeLanguage('en');
});

beforeEach(() => {
  vi.useFakeTimers();
  answers = { 'ws-a:session': answer('ws-a', ['Doc A1', 'Doc A2']) };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DocsSearchPanel', () => {
  it('marks the matched words of the excerpt and announces the settled answer once', () => {
    render(<Panel workspaceId="ws-a" />);
    type('session');

    expect(visible('2 results')).toBeTruthy();
    expect(live()).toBe('2 results');
    const marks = results()!.querySelectorAll('mark');
    expect([...marks].map((mark) => mark.textContent)).toEqual(['Session', 'Session']);
    expect(marks[0]!.className).toContain('text-content-primary');
    expect(marks[0]!.className).toContain('font-medium');
  });

  it('keeps, then dims the earlier rows of a changed query and says it prepares after 2 s', () => {
    render(<Panel workspaceId="ws-a" />);
    type('session');
    type('session provider');

    // Under 400 ms of the request nothing changes, and nothing is announced.
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(visible('2 results')).toBeTruthy();
    expect(results()!.hasAttribute('inert')).toBe(false);
    expect(live()).toBe('');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    absent('2 results');
    expect(results()!.hasAttribute('inert')).toBe(true);
    expect(results()!.getAttribute('aria-busy')).toBe('true');
    expect(results()!.className).toContain('opacity-50');
    expect(live()).toBe('');

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(visible('Preparing search by meaning…')).toBeTruthy();
    expect(live()).toBe('Preparing search by meaning…');
  });

  it('never shows the answer of another workspace while the new one loads', () => {
    const { rerender } = render(<Panel workspaceId="ws-a" />);
    type('session');
    expect(visible('Doc A1')).toBeTruthy();

    rerender(<Panel workspaceId="ws-b" />);
    absent('Doc A1');
    absent('2 results');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    absent('Doc A1');
    expect(results()).toBeNull();

    // The new workspace's own answer replaces the wait.
    answers['ws-b:session'] = answer('ws-b', ['Doc B1']);
    rerender(<Panel workspaceId="ws-b" />);
    expect(visible('Doc B1')).toBeTruthy();
    expect(live()).toBe('1 result');
  });

  it('removes the earlier rows on a failure and offers Retry', () => {
    render(<Panel workspaceId="ws-a" />);
    type('session');
    answers['ws-a:session limit'] = 'failed';
    type('session limit');

    expect(results()).toBeNull();
    expect(visible('Search is unavailable right now.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(live()).toBe('Search is unavailable right now.');
  });
});
