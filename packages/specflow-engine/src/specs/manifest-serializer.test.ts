import { describe, expect, it } from 'vitest';

import { serializeSpecificationManifest, updateManifestRegistry } from './manifest-serializer';
import {
  SpecificationError,
  parseSpecificationManifestText,
  type SpecificationManifest,
} from './model';

const manifest: SpecificationManifest = {
  specId: '11111111-2222-4333-8444-555555555555',
  slug: 'my-spec',
  title: 'My: "spec"',
  archetype: {
    id: 'feature',
    version: 2,
    requirements: [{ documentType: 'overview', minCount: 1 }],
  },
  documents: [
    { id: 'overview', path: 'overview.md', type: 'overview' },
    { id: 'behaviour', path: 'behaviour.md', type: 'behaviour' },
  ],
  folders: ['research'],
  status: 'draft',
  location: 'active',
  priority: 10,
  created: '2026-10-24',
  tasks: [],
};

describe('serializeSpecificationManifest', () => {
  it('round-trips through the strict parser', () => {
    const text = serializeSpecificationManifest(manifest);
    expect(parseSpecificationManifestText(text, 'my-spec', 'active')).toEqual(manifest);
  });

  it('is deterministic and omits empty folders and absent optional fields', () => {
    const bare: SpecificationManifest = {
      ...manifest,
      folders: [],
    };
    const { priority: _priority, created: _created, ...rest } = bare;
    const text = serializeSpecificationManifest(rest);
    expect(text).toBe(serializeSpecificationManifest(rest));
    expect(text).not.toContain('folders');
    expect(text).not.toContain('priority');
    expect(text).not.toContain('created');
    expect(text).not.toContain('type: standard');
  });

  it('preserves unknown top-level keys and ignores known keys in them', () => {
    const text = serializeSpecificationManifest(manifest, {
      'x-owner': { team: 'core' },
      title: 'ignored',
    });
    expect(text).toContain('x-owner:');
    expect(text).toContain('team: core');
    expect(parseSpecificationManifestText(text, 'my-spec', 'active').title).toBe(manifest.title);
  });

  it('refuses to produce a manifest the parser would reject', () => {
    expect(() =>
      serializeSpecificationManifest({
        ...manifest,
        documents: [{ id: 'behaviour', path: 'behaviour.md', type: 'behaviour' }],
      }),
    ).toThrow(SpecificationError);
    expect(() => serializeSpecificationManifest({ ...manifest, folders: ['overview.md'] })).toThrow(
      /folders\[0\]/u,
    );
  });
});

describe('updateManifestRegistry', () => {
  const source = `# keep this comment
id: my-spec
title: My spec
status: draft
tasks: []
spec_id: 11111111-2222-4333-8444-555555555555
x-owner: core # trailing comment
archetype:
  id: feature
  version: 1
  requirements:
    - documentType: overview
      minCount: 1
documents:
  - id: overview
    path: overview.md
    type: overview
`;

  it('replaces documents and folders while keeping unknown keys, comments and key order', () => {
    const next = updateManifestRegistry(source, 'my-spec', 'active', {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      folders: ['research'],
    });
    expect(next).toContain('# keep this comment');
    expect(next).toContain('x-owner: core # trailing comment');
    expect(next.indexOf('spec_id')).toBeLessThan(next.indexOf('documents'));
    const parsed = parseSpecificationManifestText(next, 'my-spec', 'active');
    expect(parsed.documents.map((item) => item.id)).toEqual(['overview', 'note']);
    expect(parsed.folders).toEqual(['research']);
    expect(parsed.archetype.version).toBe(1);
  });

  it('removes the folders key when the list becomes empty', () => {
    const withFolders = updateManifestRegistry(source, 'my-spec', 'active', {
      documents: [{ id: 'overview', path: 'overview.md', type: 'overview' }],
      folders: ['research'],
    });
    const without = updateManifestRegistry(withFolders, 'my-spec', 'active', {
      documents: [{ id: 'overview', path: 'overview.md', type: 'overview' }],
      folders: [],
    });
    expect(without).not.toContain('folders');
  });

  it('refuses a result the parser would reject and invalid source YAML', () => {
    expect(() =>
      updateManifestRegistry(source, 'my-spec', 'active', {
        documents: [{ id: 'note', path: 'note.md', type: 'note' }],
        folders: [],
      }),
    ).toThrow(/overview entry/u);
    expect(() =>
      updateManifestRegistry('a: [', 'my-spec', 'active', { documents: [], folders: [] }),
    ).toThrow(/YAML/u);
  });

  it('returns the source unchanged for a no-op update, whatever its formatting', () => {
    const odd = source.replace('x-owner: core', 'x-owner:   core').replace(/\n/gu, '\r\n');
    const overview = { id: 'overview', path: 'overview.md', type: 'overview' };
    expect(
      updateManifestRegistry(odd, 'my-spec', 'active', { documents: [overview], folders: [] }),
    ).toBe(odd);
  });

  it('preserves the CRLF style and does not re-fold long untouched scalars', () => {
    const long = 'word '.repeat(60).trim();
    const crlf = source.replace('title: My spec', `title: ${long}`).replace(/\n/gu, '\r\n');
    const next = updateManifestRegistry(crlf, 'my-spec', 'active', {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      folders: [],
    });
    expect(next).toContain(`title: ${long}\r\n`);
    expect(next.replace(/\r\n/gu, '')).not.toContain('\n');
    expect(next).toContain('# keep this comment');
  });

  it('keeps LF sources LF', () => {
    const next = updateManifestRegistry(source, 'my-spec', 'active', {
      documents: [
        { id: 'overview', path: 'overview.md', type: 'overview' },
        { id: 'note', path: 'note.md', type: 'note' },
      ],
      folders: [],
    });
    expect(next).not.toContain('\r');
  });
});
