import { Value } from 'typebox/value';
import { DocumentTreeSchema } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';

import { deriveUnclassifiedDocumentId } from './document-ids';
import {
  computeTreeRevision,
  projectDocumentTree,
  type ObservedFile,
  type TreeProjectionInput,
} from './projection';

const NOT_IMPLEMENTED = { available: false, reason: 'not-implemented' };

function file(path: string, overrides: Partial<ObservedFile> = {}): ObservedFile {
  return {
    path,
    size: 10,
    revision: 'r-' + path,
    kind: 'text',
    mediaType: 'text/markdown; charset=utf-8',
    ...overrides,
  };
}

function input(overrides: Partial<TreeProjectionInput> = {}): TreeProjectionInput {
  return {
    manifest: {
      archetype: {
        id: 'feature',
        version: 1,
        requirements: [
          { documentType: 'overview', minCount: 1 },
          { documentType: 'behaviour', minCount: 1 },
        ],
      },
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'behaviour', path: 'behaviour.md', type: 'behaviour' },
      ],
      folders: [],
    },
    manifestBytes: Buffer.from('manifest'),
    location: 'active',
    files: [file('overview.md'), file('behaviour.md')],
    truncated: false,
    skippedEntries: 0,
    skippedPaths: [],
    archiveLimit: { exceeded: false },
    ...overrides,
  };
}

describe('projectDocumentTree', () => {
  it('produces a schema-valid tree for registered documents', () => {
    const tree = projectDocumentTree(input({ archetypeTitle: 'Feature' }));
    expect(Value.Check(DocumentTreeSchema, tree)).toBe(true);
    expect(tree.archetype).toEqual({ id: 'feature', version: 1, title: 'Feature' });
    expect(tree.documents.map((document) => [document.id, document.classification])).toEqual([
      ['behaviour', 'registered'],
      ['overview', 'registered'],
    ]);
    expect(tree.completeness.complete).toBe(true);
    expect(tree.issues).toEqual([]);
    expect(tree.truncated).toBe(false);
    expect(tree.capabilities.formats).toEqual(['md', 'txt']);
  });

  it('marks only overview protected and reports it on delete, rename and move', () => {
    const tree = projectDocumentTree(input());
    const overview = tree.documents.find((document) => document.id === 'overview')!;
    const behaviour = tree.documents.find((document) => document.id === 'behaviour')!;
    expect(overview.protected).toBe(true);
    for (const name of ['rename', 'move', 'delete'] as const) {
      expect(overview.actions[name]).toEqual({ available: false, reason: 'protected' });
      expect(behaviour.actions[name]).toEqual(NOT_IMPLEMENTED);
    }
    expect(behaviour.protected).toBe(false);
  });

  it('reports every write action and capability as not-implemented before D4', () => {
    const tree = projectDocumentTree(input());
    expect(tree.capabilities.createFile).toEqual(NOT_IMPLEMENTED);
    expect(tree.capabilities.createFolder).toEqual(NOT_IMPLEMENTED);
    expect(tree.capabilities.import).toEqual(NOT_IMPLEMENTED);
    expect(tree.capabilities.classify).toEqual(NOT_IMPLEMENTED);
    // busy and commit-blocked are emitted from D4 only.
    expect(JSON.stringify(tree)).not.toMatch(/"(busy|commit-blocked)"/u);
  });

  it('never reports a registered document as classifiable and gives no reason for it', () => {
    const tree = projectDocumentTree(input());
    expect(tree.documents[0]!.actions.classify).toEqual({ available: false });
  });

  it('offers unclassified files a derived u- id, no type and a classify action', () => {
    const tree = projectDocumentTree(
      input({ files: [file('overview.md'), file('notes/Idea.MD')] }),
    );
    const hand = tree.documents.find((document) => document.path === 'notes/Idea.MD')!;
    expect(hand.id).toBe(deriveUnclassifiedDocumentId('notes/Idea.MD'));
    expect(hand.id.startsWith('u-')).toBe(true);
    expect(hand.classification).toBe('unclassified');
    expect(hand.type).toBeUndefined();
    expect(hand.actions.classify).toEqual(NOT_IMPLEMENTED);
    expect(hand.satisfiesRequirement).toBe(false);
    expect(tree.issues).toContainEqual({ code: 'unclassified', path: 'notes/Idea.MD' });
    expect(tree.folders.map((folder) => folder.path)).toEqual(['', 'notes']);
  });

  it('reports a registered entry without a file as dangling and unmet', () => {
    const tree = projectDocumentTree(input({ files: [file('overview.md')] }));
    expect(tree.dangling).toEqual([
      {
        id: 'behaviour',
        path: 'behaviour.md',
        type: 'behaviour',
        actions: { delete: NOT_IMPLEMENTED },
      },
    ]);
    expect(tree.completeness.complete).toBe(false);
    expect(tree.issues).toEqual([
      { code: 'dangling', path: 'behaviour.md', documentType: 'behaviour' },
      { code: 'requirement-unmet', documentType: 'behaviour' },
    ]);
  });

  it('keeps a dangling overview protected', () => {
    const tree = projectDocumentTree(input({ files: [file('behaviour.md')] }));
    expect(tree.dangling[0]!.actions.delete).toEqual({ available: false, reason: 'protected' });
  });

  it('computes satisfiesRequirement from the persisted requirements only', () => {
    const tree = projectDocumentTree(
      input({
        manifest: {
          archetype: {
            id: 'minimal',
            version: 1,
            requirements: [{ documentType: 'overview', minCount: 1 }],
          },
          documents: [
            { id: 'overview', path: 'overview.md', type: 'overview' },
            { id: 'behaviour', path: 'behaviour.md', type: 'behaviour' },
          ],
          folders: [],
        },
      }),
    );
    const byId = Object.fromEntries(tree.documents.map((document) => [document.id, document]));
    expect(byId.overview!.satisfiesRequirement).toBe(true);
    expect(byId.behaviour!.satisfiesRequirement).toBe(false);
  });

  it('marks everything archived in the archive location, and nothing editable', () => {
    const tree = projectDocumentTree(input({ location: 'archive' }));
    const archived = { available: false, reason: 'archived' };
    for (const document of tree.documents) {
      expect(document.editable).toBe(false);
      expect(document.actions.rename).toEqual(archived);
      expect(document.actions.move).toEqual(archived);
      expect(document.actions.delete).toEqual(archived);
    }
    for (const folder of tree.folders) expect(folder.actions.delete).toEqual(archived);
    expect(tree.capabilities.createFile).toEqual(archived);
    expect(tree.capabilities.classify).toEqual(archived);
  });

  it('gives the root folder the root reason and nested folders the generic one', () => {
    const tree = projectDocumentTree(input({ files: [file('overview.md'), file('a/b/c.md')] }));
    expect(tree.folders.map((folder) => folder.path)).toEqual(['', 'a', 'a/b']);
    expect(tree.folders[0]!.actions.delete).toEqual({ available: false, reason: 'root' });
    expect(tree.folders[1]!.actions.rename).toEqual(NOT_IMPLEMENTED);
  });

  it('adds explicit empty folders to the derived ones', () => {
    const tree = projectDocumentTree(
      input({ manifest: { ...input().manifest, folders: ['research/old'] } }),
    );
    expect(tree.folders.map((folder) => folder.path)).toEqual(['', 'research', 'research/old']);
  });

  it.each(['branch-protected', 'branch-not-allowed', 'git-policy-invalid'] as const)(
    'carries the advisory policy reason %s where no stronger reason applies',
    (policyReason) => {
      const tree = projectDocumentTree(input({ policyReason }));
      const reason = { available: false, reason: policyReason };
      expect(tree.capabilities.createFile).toEqual(reason);
      const behaviour = tree.documents.find((document) => document.id === 'behaviour')!;
      expect(behaviour.actions.delete).toEqual(reason);
      const overview = tree.documents.find((document) => document.id === 'overview')!;
      expect(overview.actions.delete).toEqual({ available: false, reason: 'protected' });
      expect(tree.folders[0]!.actions.rename).toEqual({ available: false, reason: 'root' });
    },
  );

  it('lets archived win over the policy reason', () => {
    const tree = projectDocumentTree(
      input({ location: 'archive', policyReason: 'branch-protected' }),
    );
    expect(tree.capabilities.createFile).toEqual({ available: false, reason: 'archived' });
  });

  describe('kinds and editable', () => {
    it('is editable for md and txt text within the save limit in an active Specification', () => {
      const tree = projectDocumentTree(
        input({
          files: [
            file('overview.md'),
            file('a.txt', { mediaType: 'text/plain; charset=utf-8' }),
            file('big.md', { size: 1024 * 1024 + 1 }),
            file('edge.md', { size: 1024 * 1024 }),
            file('data.json', { mediaType: 'text/plain; charset=utf-8' }),
            file('nul.md', { kind: 'binary', mediaType: 'application/octet-stream' }),
            file('pic.png', { kind: 'image', mediaType: 'image/png' }),
          ],
        }),
      );
      const editable = Object.fromEntries(tree.documents.map((d) => [d.path, d.editable]));
      expect(editable).toEqual({
        'overview.md': true,
        'a.txt': true,
        'big.md': false,
        'edge.md': true,
        'data.json': false,
        'nul.md': false,
        'pic.png': false,
      });
      const kinds = Object.fromEntries(tree.documents.map((d) => [d.path, d.kind]));
      expect(kinds['pic.png']).toBe('image');
      expect(kinds['nul.md']).toBe('binary');
    });
  });

  describe('issues', () => {
    it('reports every path of a case collision with different u- ids', () => {
      const tree = projectDocumentTree(
        input({ files: [file('overview.md'), file('A.md'), file('a.md')] }),
      );
      const collisions = tree.issues.filter((issue) => issue.code === 'path-case-collision');
      expect(collisions).toEqual([
        { code: 'path-case-collision', path: 'A.md' },
        { code: 'path-case-collision', path: 'a.md' },
      ]);
      const ids = tree.documents.filter((d) => d.path.toLowerCase() === 'a.md').map((d) => d.id);
      expect(new Set(ids).size).toBe(2);
    });

    it('reports skipped entries with their paths and the count', () => {
      const tree = projectDocumentTree(
        input({ skippedEntries: 3, skippedPaths: ['link', 'x/pipe'] }),
      );
      expect(tree.skippedEntries).toBe(3);
      expect(tree.issues).toEqual([
        { code: 'skipped-entry', path: 'link' },
        { code: 'skipped-entry', path: 'x/pipe' },
      ]);
    });

    it('reports archive-limit with the offending file when known', () => {
      expect(projectDocumentTree(input({ archiveLimit: { exceeded: true } })).issues).toEqual([
        { code: 'archive-limit' },
      ]);
      expect(
        projectDocumentTree(input({ archiveLimit: { exceeded: true, path: 'big.bin' } })).issues,
      ).toEqual([{ code: 'archive-limit', path: 'big.bin' }]);
    });

    it('orders issues: validation first, then filesystem facts', () => {
      const tree = projectDocumentTree(
        input({
          files: [file('overview.md'), file('X.md'), file('x.md')],
          skippedEntries: 1,
          skippedPaths: ['s'],
          archiveLimit: { exceeded: true },
        }),
      );
      expect(tree.issues.map((issue) => issue.code)).toEqual([
        'dangling',
        'unclassified',
        'unclassified',
        'requirement-unmet',
        'skipped-entry',
        'path-case-collision',
        'path-case-collision',
        'archive-limit',
      ]);
    });

    it('passes the truncated flag through', () => {
      expect(projectDocumentTree(input({ truncated: true })).truncated).toBe(true);
    });
  });

  it('never lists the manifest or a reserved root name as a document', () => {
    const tree = projectDocumentTree(
      input({ files: [file('overview.md'), file('specification.yaml'), file('CHANGE.yaml')] }),
    );
    expect(tree.documents.map((document) => document.path)).toEqual(['overview.md']);
  });

  it('is deterministic whatever the input order', () => {
    const forward = projectDocumentTree(
      input({ files: [file('overview.md'), file('b.md'), file('a.md')] }),
    );
    const backward = projectDocumentTree(
      input({ files: [file('a.md'), file('b.md'), file('overview.md')] }),
    );
    expect(backward).toEqual(forward);
  });
});

describe('computeTreeRevision', () => {
  const manifest = Buffer.from('id: x\n');
  const files = [
    { path: 'a.md', revision: '1' },
    { path: 'b.md', revision: '2' },
  ];

  it('is stable and independent of file order', () => {
    expect(computeTreeRevision(manifest, files)).toBe(
      computeTreeRevision(manifest, [...files].reverse()),
    );
  });

  it('changes with the manifest bytes, a file revision, a path and a file set', () => {
    const base = computeTreeRevision(manifest, files);
    expect(computeTreeRevision(Buffer.from('id: y\n'), files)).not.toBe(base);
    expect(computeTreeRevision(manifest, [files[0]!, { path: 'b.md', revision: '3' }])).not.toBe(
      base,
    );
    expect(computeTreeRevision(manifest, [files[0]!, { path: 'c.md', revision: '2' }])).not.toBe(
      base,
    );
    expect(computeTreeRevision(manifest, [files[0]!])).not.toBe(base);
  });

  it('does not confuse a path boundary with a revision boundary', () => {
    expect(computeTreeRevision(manifest, [{ path: 'a', revision: 'b:c' }])).not.toBe(
      computeTreeRevision(manifest, [{ path: 'a:b', revision: 'c' }]),
    );
  });
});
