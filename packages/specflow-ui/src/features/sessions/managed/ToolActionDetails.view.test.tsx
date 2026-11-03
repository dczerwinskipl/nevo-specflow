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

function renderDetail() {
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
        <SingleToolActionDetail item={action} source={{ api, sessionId: 'session-1' }} />
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

  it('shows parameters and response on the same read-only code view with line numbers', async () => {
    renderDetail();
    const input = await screen.findByRole('textbox', { name: 'Parameters' });
    const output = await screen.findByRole('textbox', { name: 'Tool response' });

    for (const block of [input, output]) {
      expect(block.getAttribute('aria-readonly')).toBe('true');
      const editor = block.closest('.cm-editor')!;
      expect(editor.querySelector('.cm-lineNumbers')).not.toBeNull();
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
