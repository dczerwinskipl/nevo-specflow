// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownDocument } from './MarkdownDocument';

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (id: string, source: string) => ({
    svg: `<svg id="${id}" viewBox="0 0 400 200"><text>${source.length}</text></svg>`,
    diagramType: 'flowchart',
  })),
}));
vi.mock('mermaid', () => ({ default: mermaid }));

const fence = (body: string, language = 'mermaid') => `\`\`\`${language}\n${body}\n\`\`\``;

beforeEach(() => {
  // The scroll regions measure themselves; jsdom has no layout.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('MarkdownDocument diagrams', () => {
  it('keeps every fence as code unless diagrams are asked for', () => {
    const { container } = render(<MarkdownDocument source={fence('flowchart LR\n  a --> b')} />);

    expect(container.querySelector('pre')?.textContent?.trim()).toBe('flowchart LR\n  a --> b');
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it('draws each mermaid fence with strict settings and its own id, other fences stay code', async () => {
    render(
      <MarkdownDocument
        diagrams
        sourceLines
        source={[
          fence('flowchart LR\n  a --> b'),
          fence('const a = 1;', 'ts'),
          fence('graph TD\n  c'),
        ].join('\n\n')}
      />,
    );

    // The code shows while the diagram is drawn.
    expect(screen.getAllByRole('group', { name: 'Code block' })).toHaveLength(3);
    const diagrams = await screen.findAllByRole('img', { name: 'Diagram' });

    expect(diagrams).toHaveLength(2);
    expect(diagrams[0]!.querySelector('svg')).not.toBeNull();
    expect(screen.getAllByRole('group', { name: 'Code block' })).toHaveLength(1);
    // The drawn block keeps its source line for the edit/preview scroll position.
    const region = screen.getAllByRole('group', { name: 'Diagram' })[0]!;
    expect(region.closest('[data-source-line]')?.getAttribute('data-source-line')).toBe('1');
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: 'strict',
        htmlLabels: false,
        suppressErrorRendering: true,
        theme: 'base',
      }),
    );
    const ids = mermaid.render.mock.calls.map(([id]) => id);
    expect(new Set(ids).size).toBe(2);
    expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), 'flowchart LR\n  a --> b');
  });

  it('keeps the code with a quiet note when a diagram cannot be drawn', async () => {
    mermaid.render.mockRejectedValueOnce(new Error('Parse error on line 1'));
    render(
      <MarkdownDocument
        diagrams
        labels={{ diagramFailed: 'Nie udało się narysować diagramu' }}
        source={fence('flowchart ->')}
      />,
    );

    expect(await screen.findByText('Nie udało się narysować diagramu')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Code block' }).textContent?.trim()).toBe(
      'flowchart ->',
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(document.body.textContent).not.toContain('Parse error');
  });

  it('zooms with the keyboard and the controls, resets, and opens a second drawing full screen', async () => {
    render(<MarkdownDocument diagrams source={fence('flowchart LR\n  a --> b')} />);
    await screen.findByRole('img', { name: 'Diagram' });
    const region = screen.getByRole('group', { name: 'Diagram' });
    const scale = () => Number(region.getAttribute('data-diagram-scale'));
    const reset = screen.getByRole('button', { name: 'Fit diagram' });

    // A small diagram opens at its natural size; it cannot be zoomed out further.
    expect(scale()).toBe(1);
    expect(reset).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Zoom out' })).toHaveProperty('disabled', true);
    fireEvent.keyDown(region, { key: '+' });
    expect(scale()).toBe(1.25);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(scale()).toBeCloseTo(1.5625);
    expect(reset).toHaveProperty('disabled', false);
    fireEvent.keyDown(region, { key: '0' });
    expect(scale()).toBe(1);
    // Ctrl+key and plain letters are left to the browser.
    fireEvent.keyDown(region, { key: '+', ctrlKey: true });
    expect(scale()).toBe(1);
    // At the fitted view an arrow moves nothing, so it is left to scroll the page.
    expect(fireEvent.keyDown(region, { key: 'ArrowDown' })).toBe(true);
    fireEvent.keyDown(region, { key: '+' });
    expect(fireEvent.keyDown(region, { key: 'ArrowRight' })).toBe(false);
    fireEvent.keyDown(region, { key: '0' });

    fireEvent.click(screen.getByRole('button', { name: 'Open diagram full screen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Diagram' });
    await within(dialog).findByRole('img', { name: 'Diagram' });
    const ids = mermaid.render.mock.calls.map(([id]) => id);
    // Full screen draws its own copy, so no SVG id is on the page twice.
    expect(new Set(ids).size).toBe(2);
    expect(document.querySelectorAll(`[id="${ids[0]}"]`)).toHaveLength(1);
  });

  it('draws a changed source only after it has been still for 500 ms, without flashing the note', async () => {
    vi.useFakeTimers();
    const flush = () => act(async () => Promise.resolve());
    const typed = (body: string) => (
      <MarkdownDocument diagrams source={fence(`flowchart LR\n  ${body}`)} />
    );
    const { rerender } = render(typed('a --> b'));
    await flush();
    await flush();
    expect(screen.getByRole('img', { name: 'Diagram' })).toBeTruthy();

    // Typing: a half-written fence shows as code, with no failure note and no new drawing yet.
    rerender(typed('a -->'));
    rerender(typed('a --> c'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('group', { name: 'Code block' }).textContent).toContain('a --> c');
    expect(screen.queryByText('Diagram could not be rendered')).toBeNull();
    await act(async () => vi.advanceTimersByTime(499));
    expect(mermaid.render).toHaveBeenCalledTimes(1);

    // Still for 500 ms: only the latest source is drawn, once.
    await act(async () => vi.advanceTimersByTime(1));
    await flush();
    await flush();
    expect(mermaid.render).toHaveBeenCalledTimes(2);
    expect(mermaid.render).toHaveBeenLastCalledWith(expect.any(String), 'flowchart LR\n  a --> c');
    expect(screen.getByRole('img', { name: 'Diagram' })).toBeTruthy();
    vi.useRealTimers();
  });
});
