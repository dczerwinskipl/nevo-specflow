// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TooltipProvider,
  treeAttentionGlyphClassName,
  treeGlyphSlotClassName,
  treeLeafItemClassName,
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
});
