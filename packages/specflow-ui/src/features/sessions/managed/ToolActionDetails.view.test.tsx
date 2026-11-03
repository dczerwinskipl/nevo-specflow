// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ContentRef, ToolActionSummary } from '@nevo/specflow-contracts/sessions';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import type { ManagedSessionsApi } from './api';
import { SingleToolActionDetail } from './ToolActionDetails';

const rawInput = '{"pattern":"admission","path":"src","limit":3}';
const rawOutput = 'src/admission.mjs:42: export function admission() {\n  return true;\n}';
const inputRef: ContentRef = {
  contentId: 'content-in',
  revision: '1',
  byteLength: rawInput.length,
};
const outputRef: ContentRef = {
  contentId: 'content-out',
  revision: '1',
  byteLength: rawOutput.length,
};

const action: ToolActionSummary = {
  actionId: 'action-1',
  ordinal: 1,
  revision: 1,
  state: 'completed',
  title: { text: 'Search admission', complete: true },
  createdAt: '2026-10-30T10:00:00Z',
  updatedAt: '2026-10-30T10:00:01Z',
  input: inputRef,
  output: outputRef,
};

function renderDetail(item: ToolActionSummary = action) {
  const bodies: Record<string, string> = { 'content-in': rawInput, 'content-out': rawOutput };
  const api = {
    content: (_sessionId: string, ref: ContentRef, offset: number) =>
      Promise.resolve({
        contentId: ref.contentId,
        revision: ref.revision,
        offset,
        text: bodies[ref.contentId]!,
        complete: true,
      }),
  } as unknown as ManagedSessionsApi;

  return render(
    <StoryLocalization locale="en">
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SingleToolActionDetail item={item} source={{ api, sessionId: 'session-1' }} />
      </QueryClientProvider>
    </StoryLocalization>,
  );
}

describe('ToolAction details', () => {
  beforeEach(() => {
    // jsdom has no ResizeObserver; the ScrollArea's edge cues only need it to exist here.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      },
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('numbers only the JSON it pretty-printed; the verbatim response keeps its own lines, no gutter', async () => {
    renderDetail();
    const input = await screen.findByRole('textbox', { name: 'Parameters' });
    const output = await screen.findByRole('textbox', { name: 'Tool response' });

    expect(input.closest('.cm-editor')!.querySelector('.cm-lineNumbers')).not.toBeNull();
    expect(output.closest('.cm-editor')!.querySelector('.cm-gutters')).toBeNull();
    for (const block of [input, output]) {
      expect(block.getAttribute('aria-readonly')).toBe('true');
      const editor = block.closest('.cm-editor')!;
      // A passive viewer: no "current line" tint.
      expect(editor.querySelector('.cm-activeLine')).toBeNull();
      // Same surface for both: the shared code surface on a height-capped scroller.
      const surface = block.closest('.scroll-area')!;
      expect(surface.className).toContain('bg-surface-control');
      expect(surface.querySelector('.scroll-area-viewport')!.className).toContain('max-h-80');
    }

    // JSON parameters are pretty-printed and coloured; the verbatim response is not coloured.
    expect(input.textContent).toContain('"pattern": "admission"');
    expect(input.querySelectorAll('.cm-line span').length).toBeGreaterThan(0);
    expect(output.querySelectorAll('.cm-line span')).toHaveLength(0);
    expect(output.textContent).toBe(rawOutput.replaceAll('\n', ''));
  });

  const status = () => document.querySelector<HTMLElement>('[data-tool-action-status]')!;

  it('heads a completed action with its full title, a success mark and the duration only', async () => {
    renderDetail();
    await screen.findByRole('textbox', { name: 'Parameters' });

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Search admission');
    const line = status();
    // The success icon is the visible mark; the state word is there for assistive technology only.
    expect(line.querySelector('svg.text-status-success')).not.toBeNull();
    expect(line.querySelector('.sr-only')?.textContent).toBe('Completed');
    const time = line.querySelector('time')!;
    expect(time.textContent).toMatch(/^1(\.0)?\s?s(ec)?$/);
    // A one-second run: the clock range is reachable as the duration's tooltip, not shown.
    expect(time.getAttribute('title')).toMatch(/^\d{1,2}:\d\d:\d\d\D*–\d{1,2}:\d\d:\d\d\D*$/);
    expect(line.textContent).not.toContain('–');
  });

  it('shows the clock range in the line once a run lasts a minute or more', async () => {
    renderDetail({ ...action, updatedAt: '2026-10-30T10:02:30Z' });
    await screen.findByRole('textbox', { name: 'Parameters' });

    expect(status().textContent).toMatch(/\d{1,2}:\d\d:\d\d\D*–\d{1,2}:\d\d:\d\d/);
  });

  it('names a failure in words next to its icon, with the readable message below', async () => {
    renderDetail({
      ...action,
      state: 'failed',
      error: { code: 'process_exit', message: 'Tests failed: 1 of 42' },
    });
    await screen.findByRole('textbox', { name: 'Parameters' });

    const line = status();
    expect(line.querySelector('svg.text-status-danger')).not.toBeNull();
    expect(line.textContent).toContain('Failed');
    expect(screen.getByText('Tests failed: 1 of 42')).toBeTruthy();
  });

  it('shows a running action as running, with no duration and no success mark', async () => {
    renderDetail({ ...action, state: 'active', updatedAt: action.createdAt });
    await screen.findByRole('textbox', { name: 'Parameters' });

    const line = status();
    expect(line.textContent).toBe('In progress');
    expect(line.querySelector('time')).toBeNull();
    expect(line.querySelector('.text-status-success')).toBeNull();
  });

  it('copies the original text, not the pretty-printed presentation', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderDetail();
    await screen.findByRole('textbox', { name: 'Parameters' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy parameters' }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(rawInput);
  });
});
