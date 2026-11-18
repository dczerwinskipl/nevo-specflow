// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TooltipProvider,
  treeAttentionGlyphClassName,
  treeGlyphSlotClassName,
  treeAttentionStateLabelClassName,
  treeLeafItemClassName,
  treeSecondaryStateLabelClassName,
  treeStateLabelClassName,
  treeStaticItemClassName,
} from '@nevo/ui';
import { TreeLevel } from './TreeLevel';
import { TreeDocumentRow, TreeFolderRow } from './TreeRows';

afterEach(cleanup);

const noop = () => undefined;

const leafOffset = treeLeafItemClassName.split(' ').at(-1)!;
const tree = (children: ReactNode, flat = false) =>
  render(
    <TooltipProvider>
      <TreeLevel top flat={flat}>
        {children}
      </TreeLevel>
    </TooltipProvider>,
  );
const row = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

describe('shared document tree rows', () => {
  it('lines a document up with the folder icons beside folders, at the row edge in a flat level', () => {
    tree(
      <>
        <TreeFolderRow name="guides" expanded={false} onToggle={noop} />
        <TreeDocumentRow name="notes.md" current={false} onOpen={noop} />
      </>,
    );
    expect(row('notes.md').className).toContain(leafOffset);
    expect(row('guides').className).not.toContain(leafOffset);
    cleanup();

    tree(<TreeDocumentRow name="notes.md" current={false} onOpen={noop} />, true);
    expect(row('notes.md').className).not.toContain(leafOffset);
  });

  it('puts the leading document glyph in the chevron column, and a missing file gets the warning glyph', () => {
    tree(
      <>
        <TreeDocumentRow name="spec.md" lead current={false} onOpen={noop} />
        <TreeDocumentRow
          name="gone.md"
          lead
          state={{ text: 'File missing', attention: true }}
          current={false}
          onOpen={noop}
        />
      </>,
    );
    const lead = row('spec.md');
    expect(lead.className).not.toContain(leafOffset);
    expect(lead.firstElementChild?.className).toBe(treeGlyphSlotClassName);
    expect(lead.querySelector('span.font-medium')?.textContent).toBe('spec.md');

    const missing = row('gone.md');
    expect(missing.className).toContain(leafOffset);
    expect(missing.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(missing.firstElementChild?.getAttribute('class')).toContain(
      treeAttentionGlyphClassName.split(' ').at(-1),
    );
    expect(missing.textContent).toContain('File missing');
  });

  it('marks only the open document as current', () => {
    tree(
      <>
        <TreeDocumentRow name="open.md" current onOpen={noop} />
        <TreeDocumentRow name="other.md" current={false} onOpen={noop} />
      </>,
    );
    expect(row('open.md').getAttribute('aria-current')).toBe('true');
    expect(row('other.md').hasAttribute('aria-current')).toBe(false);
  });

  it('tones the trailing label: muted by default, secondary or attention on request', () => {
    tree(
      <>
        <TreeDocumentRow name="a.md" state={{ text: 'Quiet' }} current={false} onOpen={noop} />
        <TreeDocumentRow
          name="b.md"
          state={{ text: 'Acted on', tone: 'secondary' }}
          current={false}
          onOpen={noop}
        />
        <TreeDocumentRow
          name="c.md"
          state={{ text: 'Look', tone: 'attention' }}
          current={false}
          onOpen={noop}
        />
      </>,
      true,
    );
    expect(screen.getByText('Quiet').className).toContain(treeStateLabelClassName);
    expect(screen.getByText('Acted on').className).toContain(treeSecondaryStateLabelClassName);
    expect(screen.getByText('Look').className).toContain(treeAttentionStateLabelClassName);
    // The label tone alone keeps the row's own glyph; the label carries its own warning icon.
    expect(row('c.md').firstElementChild?.getAttribute('class')).not.toContain(
      treeAttentionGlyphClassName.split(' ').at(-1),
    );
    expect(screen.getByText('Look').querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Acted on').querySelector('svg')).toBeNull();
  });

  it('swaps a long label for its short form in a narrow row (a container query)', () => {
    tree(
      <TreeDocumentRow
        name="behaviour.md"
        state={{ text: 'Needed to finish Write the specification', shortText: 'Needed to finish' }}
        current={false}
        onOpen={noop}
      />,
      true,
    );
    expect(screen.getByText('Needed to finish Write the specification').className).toContain(
      '@max-md/tree-row:hidden',
    );
    expect(screen.getByText('Needed to finish').className).toContain('@max-md/tree-row:inline');
  });

  it('lets a wrapping label take its own line instead of cutting the name', () => {
    tree(
      <TreeDocumentRow
        name="behaviour.md"
        state={{ text: 'Needed to finish Write the specification', wrap: true }}
        current={false}
        onOpen={noop}
      />,
      true,
    );
    const button = row('behaviour.md');
    expect(button.className).toContain('flex-wrap');
    // Glyph and name stay together; on its own line the label wraps and keeps every word.
    expect(screen.getByText('behaviour.md').parentElement?.className).toContain('shrink-0');
    const text = screen.getByText('Needed to finish Write the specification');
    expect(text.className).not.toContain('truncate');
    expect(text.parentElement?.className).not.toContain('whitespace-nowrap');
  });

  it('draws a row that opens nothing as the same line, not a button', () => {
    tree(<TreeDocumentRow name="src/**" state={{ text: 'Required' }} current={false} />, true);
    expect(screen.queryByRole('button')).toBeNull();
    const item = screen.getByText('src/**').parentElement!;
    expect(item.tagName.toLowerCase()).toBe('div');
    expect(item.className).toBe(treeStaticItemClassName);
  });
});
