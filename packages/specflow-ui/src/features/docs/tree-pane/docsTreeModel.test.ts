import { describe, expect, it } from 'vitest';
import type { WorkspaceDocsTreeDocument } from '@nevo/specflow-contracts/docs';
import { buildDocsTree, visibleRows } from './docsTreeModel';

const doc = (path: string, title: string, extra: Partial<WorkspaceDocsTreeDocument> = {}) => ({
  documentId: path,
  title,
  type: 'guide',
  status: 'current',
  path,
  summary: '',
  proposal: false,
  ...extra,
});

const documents = [
  doc('b.md', 'Beta'),
  doc('README.md', 'Zeta index'),
  doc('guide/z.md', 'Zulu'),
  doc('Guide2/a.md', 'Alpha'),
  doc('guide/README.md', 'Guide hub'),
  doc('ideas/x/one.md', 'One', { proposal: true }),
  doc('ideas/two.md', 'Two', { proposal: true }),
];

describe('documentation tree model', () => {
  it('orders folders first, the hub first, then titles; labels the folder that owns the proposals once', () => {
    const root = buildDocsTree(documents);
    expect(root.folders.map((folder) => folder.name)).toEqual(['guide', 'Guide2', 'ideas']);
    expect(root.documents.map((item) => item.title)).toEqual(['Zeta index', 'Beta']);
    expect(root.folders[0]!.documents.map((item) => item.title)).toEqual(['Guide hub', 'Zulu']);
    const ideas = root.folders[2]!;
    expect(ideas.ownsProposals).toBe(true);
    expect(ideas.folders[0]!.ownsProposals).toBe(false);
    expect(root.folders[0]!.ownsProposals).toBe(false);
  });

  it('lists the visible rows in reading order with their parent folders', () => {
    const root = buildDocsTree(documents);
    const expanded = new Set(['guide']);
    const rows = visibleRows(root, expanded);
    expect(rows.map((row) => row.key)).toEqual([
      'folder:guide',
      'document:guide/README.md',
      'document:guide/z.md',
      'folder:Guide2',
      'folder:ideas',
      'document:README.md',
      'document:b.md',
    ]);
    expect(rows[2]).toEqual({
      key: 'document:guide/z.md',
      kind: 'document',
      id: 'guide/z.md',
      parentKey: 'folder:guide',
    });
  });
});
