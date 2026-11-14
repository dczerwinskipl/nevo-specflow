// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownDocument } from './MarkdownDocument';

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (id: string, source: string) => ({
    svg: `<svg id="${id}"><text>${source.length}</text></svg>`,
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
});
