// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ContentRef, ToolActionSummary } from '@nevo/specflow-contracts/sessions';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import type { ManagedSessionsApi } from './api';
import { SingleToolActionDetail, SingleToolActionHeader } from './ToolActionDetails';
import { resetCodeWrapPreference, useCodeWrapPreference } from './codeWrapPreference';

/** Stands in for the actions screen's Wrap lines header action (`WorkInspector.tsx`). */
function WrapLines() {
  const [wrap, setWrap] = useCodeWrapPreference();

  return (
    <button type="button" aria-pressed={wrap} onClick={() => setWrap(!wrap)}>
      Wrap lines
    </button>
  );
}

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

function renderDetail(
  item: ToolActionSummary = action,
  withHeader = true,
  bodies: Record<string, string> = { 'content-in': rawInput, 'content-out': rawOutput },
) {
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
        <WrapLines />
        <SingleToolActionDetail
          item={item}
          source={{ api, sessionId: 'session-1' }}
          withHeader={withHeader}
        />
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
    const output = await screen.findByRole('textbox', { name: 'Result' });

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

  it('leaves the header out when the workspace shows it as the screen detailHeader', async () => {
    renderDetail(action, false);
    await screen.findByRole('textbox', { name: 'Parameters' });

    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(document.querySelector('[data-tool-action-status]')).toBeNull();
    // The sections are still there, separated by the screen's 20px rhythm.
    const sections = [...document.querySelectorAll('section')];
    expect(sections).toHaveLength(2);
    expect(sections[0]!.parentElement!.className).toContain('gap-5');
  });

  it('declares the same header as a separate component: the title as the heading, then the status', () => {
    render(
      <StoryLocalization locale="en">
        <SingleToolActionHeader item={action} />
      </StoryLocalization>,
    );

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Search admission');
    expect(document.querySelector('[data-tool-action-status="completed"]')).not.toBeNull();
  });

  it('separates the header, the parameters and the response by the 20px section rhythm', async () => {
    renderDetail();
    await screen.findByRole('textbox', { name: 'Parameters' });

    const stack = document.querySelector('section')!.parentElement!;
    expect(stack.className).toContain('gap-5');
    expect(stack.className).not.toContain('gap-3');
    // The content's header is the subject and the status: the screen's own header names the action.
    expect(stack.firstElementChild?.querySelector('[data-tool-action-status]')).not.toBeNull();
    expect(stack.querySelector('h2')).toBeNull();
  });

  const status = () => document.querySelector<HTMLElement>('[data-tool-action-status]')!;

  it('heads a completed action with a success mark and the duration only', async () => {
    renderDetail();
    await screen.findByRole('textbox', { name: 'Parameters' });

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

  it('reads a written file: verb and workspace-relative name, its content, a relative response', async () => {
    const root = 'C:/Users/owner/worktree';
    renderDetail(
      {
        ...action,
        title: { text: 'Write', complete: true },
        operation: 'write',
        subject: 'dummy/job.sh',
      },
      true,
      {
        'content-in': JSON.stringify({
          file_path: root + '/dummy/job.sh',
          content: ['#!/bin/bash', 'echo "Hello, $1"'].join(String.fromCharCode(10)),
        }),
        'content-out': 'File created successfully at: ' + root + '/dummy/job.sh',
      },
    );
    const content = await screen.findByRole('textbox', { name: 'Content' });

    expect(document.querySelector('[data-tool-action-subject]')!.textContent).toBe('dummy/job.sh');
    expect(content.textContent).toContain('echo "Hello, $1"');
    const response = screen.getByRole('textbox', { name: 'Result' });
    expect(response.textContent).toBe('File created successfully at: dummy/job.sh');
    // The raw parameters stay one click away.
    const raw = screen.getByRole('button', { name: 'Raw parameters' });
    expect(raw.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(raw);
    expect(raw.getAttribute('aria-expanded')).toBe('true');
  });

  it('wraps every block from the screen’s one Wrap lines, and remembers it', async () => {
    resetCodeWrapPreference();
    localStorage.clear();
    renderDetail(
      { ...action, title: { text: 'Bash', complete: true }, operation: 'command' },
      true,
      {
        'content-in': JSON.stringify({ command: 'mkdir -p /tmp/job && cd /tmp/job && ./job.sh' }),
        'content-out': rawOutput,
      },
    );
    await screen.findByRole('textbox', { name: 'Command' });
    // One toggle for the screen, none per block; each block keeps its own Copy.
    const toggle = screen.getByRole('button', { name: 'Wrap lines' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getAllByRole('button', { name: /^Copy/ }).length).toBeGreaterThan(1);

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Wrap lines' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(localStorage.getItem('nevo:tool-detail:wrap-lines')).toBe('true');
    expect(document.querySelector('.cm-lineWrapping')).not.toBeNull();
    resetCodeWrapPreference();
  });
});
