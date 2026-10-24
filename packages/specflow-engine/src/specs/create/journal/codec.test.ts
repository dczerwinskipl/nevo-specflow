import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { ResolvedProjectHome } from '../../../project/home/home';
import { CREATE_JOURNAL_MAX_BYTES } from '../../documents/limits';
import { createSpecificationScaffold } from '../../scaffold';
import { fingerprintCreateClientIntent, normalizeCreateClientIntent } from '../intent';
import { parseCreateJournal } from './codec';
import type { CreateJournal } from './model';

const projectId = randomUUID();
const context = { project: { projectId } } as unknown as ResolvedProjectHome;

function build(
  options: {
    readonly addedDocuments?: readonly { path: string; type?: string; content: string }[];
    readonly folders?: readonly string[];
    readonly optionalDocumentIds?: readonly string[];
  } = {},
): CreateJournal {
  const workspaceId = randomUUID();
  const specId = randomUUID();
  const requestIntent = normalizeCreateClientIntent({
    title: 'Checkout flow',
    archetype: { id: 'feature', version: 1 },
    target: { kind: 'existing', workspaceId },
    optionalDocumentIds: ['behaviour', 'ux'],
    ...options,
  });
  const scaffold = createSpecificationScaffold({
    specId,
    title: 'Checkout flow',
    created: '2026-10-14',
    archetypeId: 'feature',
    optionalDocumentIds: requestIntent.optionalDocumentIds,
    addedDocuments: options.addedDocuments,
    folders: requestIntent.folders,
  });
  return {
    version: 2,
    projectId,
    operationId: randomUUID(),
    requestIntent,
    inputFingerprint: fingerprintCreateClientIntent(requestIntent),
    specId,
    slug: scaffold.slug,
    title: 'Checkout flow',
    created: '2026-10-14',
    catalogueRevision: 'a'.repeat(64),
    documentIds: scaffold.documentIds,
    stage: 'reserved',
    target: { kind: 'existing', workspaceId, workspaceRoot: '/workspace' },
    files: scaffold.files.map(({ relativePath, sha256, bytes }) => ({
      relativePath,
      sha256,
      bytes,
    })),
  };
}

const parse = (value: unknown, operationId: string) =>
  parseCreateJournal(context, JSON.parse(JSON.stringify(value)), operationId);

describe('Create journal version 2 codec', () => {
  it('round-trips a journal with several scaffold files and added documents', () => {
    const journal = build({
      addedDocuments: [
        { path: 'notes/a.md', type: 'note', content: 'a' },
        { path: 'b.md', content: 'b' },
      ],
      folders: ['assets'],
    });
    expect(journal.files.length).toBe(2 + 2 + 2);
    expect(parse(journal, journal.operationId)).toEqual(journal);
  });

  it('never carries file contents', () => {
    const journal = build({ addedDocuments: [{ path: 'secret.md', content: 'TOP-SECRET-BODY' }] });
    expect(JSON.stringify(journal)).not.toContain('TOP-SECRET-BODY');
  });

  it('keeps the maximum scaffold under the one journal cap', () => {
    const added = Array.from({ length: 10 }, (_, index) => ({
      path: `documents/section-${index}/` + 'n'.repeat(120) + `-${index}.md`,
      type: 'note',
      content: String(index),
    }));
    const journal = build({
      addedDocuments: added,
      folders: Array.from({ length: 100 }, (_, index) => `folder-${index}/` + 'x'.repeat(40)),
      optionalDocumentIds: ['behaviour', 'ux', 'backend', 'user-story', 'decisions', 'research'],
    });
    const bytes = Buffer.byteLength(JSON.stringify(journal, null, 2), 'utf8');
    expect(bytes).toBeLessThan(CREATE_JOURNAL_MAX_BYTES / 2);
    expect(parse(journal, journal.operationId)).toEqual(journal);
  });

  it('rejects the previous version (it is classified as unsupported before it gets here)', () => {
    const journal = build();
    expect(() => parse({ ...journal, version: 1 }, journal.operationId)).toThrowError(
      expect.objectContaining({ code: 'CREATE_JOURNAL_CORRUPT' }),
    );
  });

  it('requires the manifest and the overview first and fixed', () => {
    const journal = build();
    const [manifest, overview, ...rest] = journal.files;
    for (const files of [
      [overview, manifest, ...rest],
      [manifest],
      [
        manifest,
        {
          ...overview!,
          relativePath: manifest!.relativePath.replace('specification.yaml', 'x.md'),
        },
      ],
    ]) {
      expect(() => parse({ ...journal, files }, journal.operationId)).toThrowError(
        expect.objectContaining({ code: 'CREATE_JOURNAL_CORRUPT' }),
      );
    }
  });

  it('rejects duplicate paths, paths outside the Specification and malformed evidence', () => {
    const journal = build();
    const extra = journal.files[2]!;
    const bad = [
      [...journal.files, journal.files[2]!],
      [...journal.files, { ...extra, relativePath: 'specs/active/other/x.md' }],
      [
        ...journal.files,
        {
          ...extra,
          relativePath: journal.files[0]!.relativePath.replace('specification.yaml', 'x.md'),
          bytes: -1,
        },
      ],
      [
        ...journal.files,
        {
          ...extra,
          relativePath: journal.files[0]!.relativePath.replace('specification.yaml', 'y.md'),
          bytes: 1.5,
        },
      ],
      [
        ...journal.files,
        {
          ...extra,
          relativePath: journal.files[0]!.relativePath.replace('specification.yaml', 'z.md'),
          sha256: 'nope',
        },
      ],
      [
        ...journal.files,
        {
          ...extra,
          relativePath: journal.files[0]!.relativePath.replace('specification.yaml', 'k.md'),
          content: 'x',
        },
      ],
    ];
    for (const files of bad) {
      expect(() => parse({ ...journal, files }, journal.operationId)).toThrowError(
        expect.objectContaining({ code: 'CREATE_JOURNAL_CORRUPT' }),
      );
    }
  });

  it('rejects more files than the documented count', () => {
    const journal = build();
    const base = journal.files[0]!.relativePath.replace('specification.yaml', '');
    const files = [
      ...journal.files,
      ...Array.from({ length: 70 }, (_, index) => ({
        relativePath: `${base}extra-${index}.md`,
        sha256: 'c'.repeat(64),
        bytes: 1,
      })),
    ];
    expect(() => parse({ ...journal, files }, journal.operationId)).toThrowError(
      expect.objectContaining({ code: 'CREATE_JOURNAL_CORRUPT' }),
    );
  });

  it('requires the catalogue revision and valid unique document ids', () => {
    const journal = build();
    const { catalogueRevision: _revision, ...withoutRevision } = journal;
    for (const patch of [
      withoutRevision,
      { ...journal, documentIds: [] },
      { ...journal, documentIds: ['overview', 'overview'] },
      { ...journal, documentIds: ['Overview'] },
    ]) {
      expect(() => parse(patch, journal.operationId)).toThrowError(
        expect.objectContaining({ code: 'CREATE_JOURNAL_CORRUPT' }),
      );
    }
  });

  it('requires every added document of the intent to be a journal file of the same evidence', () => {
    const journal = build({ addedDocuments: [{ path: 'n.md', type: 'note', content: 'x' }] });
    const added = journal.requestIntent.addedDocuments[0]!;
    const tampered = {
      ...journal,
      requestIntent: {
        ...journal.requestIntent,
        addedDocuments: [{ ...added, sha256: 'd'.repeat(64) }],
      },
    };
    // The fingerprint no longer matches either; the stored evidence cannot be silently rewritten.
    expect(() => parse(tampered, journal.operationId)).toThrowError(
      expect.objectContaining({ code: 'CREATE_JOURNAL_CORRUPT' }),
    );
    const dropped = {
      ...journal,
      files: journal.files.filter((file) => !file.relativePath.endsWith('/n.md')),
    };
    expect(() => parse(dropped, journal.operationId)).toThrowError(
      expect.objectContaining({ code: 'CREATE_JOURNAL_CORRUPT' }),
    );
  });

  it('rejects unknown intent keys (for example a stored content)', () => {
    const journal = build();
    const intent = { ...journal.requestIntent, content: 'x' };
    expect(() => parse({ ...journal, requestIntent: intent }, journal.operationId)).toThrowError(
      expect.objectContaining({ code: 'CREATE_JOURNAL_CORRUPT' }),
    );
  });
});
