import { describe, expect, it } from 'vitest';

import {
  defaultManualCommitSubject,
  documentPathOf,
  manualCommitTrailers,
  resolveMessage,
} from './message';
import {
  decodeMessage,
  decodeSnapshot,
  encodeMessage,
  encodeSnapshot,
  type SnapshotEntry,
} from './payload';

const SPEC = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

describe('the default message', () => {
  it('names the Specification, the definitions or the uncommitted changes of a checkout', () => {
    expect(defaultManualCommitSubject({ scope: 'specification', slug: 'my-spec' })).toBe(
      'spec(docs): manual commit my-spec',
    );
    expect(defaultManualCommitSubject({ scope: 'definitions', slug: undefined })).toBe(
      'definitions: manual commit',
    );
    expect(defaultManualCommitSubject({ scope: 'all', slug: 'my-spec' })).toBe(
      'manual commit: uncommitted Engine changes',
    );
    expect(defaultManualCommitSubject({ scope: 'specification', slug: undefined })).toBe(
      'manual commit: uncommitted Engine changes',
    );
  });

  it('stays within a subject length even for a long slug', () => {
    const subject = defaultManualCommitSubject({ scope: 'specification', slug: 'x'.repeat(300) });
    expect(Array.from(subject)).toHaveLength(100);
  });

  it('is used when no message was given and never when one was', () => {
    const fallback = { scope: 'specification', slug: 'my-spec' } as const;
    expect(resolveMessage(undefined, fallback)).toEqual({
      ok: true,
      message: { subject: 'spec(docs): manual commit my-spec', body: '' },
    });
    expect(resolveMessage('Mine\n\nbody', fallback)).toEqual({
      ok: true,
      message: { subject: 'Mine', body: 'body' },
    });
    expect(resolveMessage('', fallback)).toEqual({ ok: false, problem: 'empty' });
  });
});

describe('the trailers of a manual commit', () => {
  const ownerOfPath = new Map([
    [`specs/active/my-spec/notes.md`, `specification-${SPEC}`],
    [`specs/active/my-spec/sub/more.md`, `specification-${SPEC}`],
    [`specs/active/other/a.md`, `specification-${OTHER}`],
    ['.nevo/definitions/archetypes/x.yaml', 'definitions'],
  ]);

  it('names the action, the scope, the Specification and its documents relative to its folder', () => {
    expect(
      manualCommitTrailers({
        scope: 'specification',
        owners: [`specification-${SPEC}`],
        effective: ['specs/active/my-spec/notes.md', 'specs/active/my-spec/sub/more.md'],
        ownerOfPath,
      }),
    ).toEqual({
      'Nevo-Action': 'manual-commit',
      'Nevo-Scope': 'specification',
      'Nevo-Spec': SPEC,
      'Nevo-Documents': 'notes.md,sub/more.md',
    });
  });

  it('names no Specification for the definitions', () => {
    expect(
      manualCommitTrailers({
        scope: 'definitions',
        owners: ['definitions'],
        effective: ['.nevo/definitions/archetypes/x.yaml'],
        ownerOfPath,
      }),
    ).toEqual({ 'Nevo-Action': 'manual-commit', 'Nevo-Scope': 'definitions' });
  });

  it('lists every Specification of a checkout-wide commit and only their documents', () => {
    const trailers = manualCommitTrailers({
      scope: 'all',
      owners: ['definitions', `specification-${SPEC}`, `specification-${OTHER}`],
      effective: [
        '.nevo/definitions/archetypes/x.yaml',
        'specs/active/my-spec/notes.md',
        'specs/active/other/a.md',
      ],
      ownerOfPath,
    });
    expect(trailers['Nevo-Spec']).toBe(`${SPEC},${OTHER}`);
    expect(trailers['Nevo-Documents']).toBe('notes.md,a.md');
  });

  it('cuts a long list at boundaries and never above 200 characters', () => {
    const effective = Array.from(
      { length: 80 },
      (_, index) => `specs/active/my-spec/doc-${String(index)}.md`,
    );
    const trailers = manualCommitTrailers({
      scope: 'specification',
      owners: [`specification-${SPEC}`],
      effective,
      ownerOfPath: new Map(effective.map((path) => [path, `specification-${SPEC}`])),
    });
    const value = trailers['Nevo-Documents']!;
    expect(value.length).toBeLessThanOrEqual(200);
    expect(value).toMatch(/,\+\d+$/u);
  });

  it('strips only the Specification folder', () => {
    expect(documentPathOf('specs/active/x/a/b.md')).toBe('a/b.md');
    expect(documentPathOf('specs/archive/x/a.md')).toBe('a.md');
    expect(documentPathOf('.nevo/definitions/a.yaml')).toBe('.nevo/definitions/a.yaml');
  });
});

describe('the payload of a manual commit', () => {
  const entries: SnapshotEntry[] = [
    { owner: 'definitions', path: 'b.yaml', postSha256: 'a'.repeat(64), operationCount: 2 },
    { owner: `specification-${SPEC}`, path: 'a.md', postSha256: null, operationCount: 1 },
  ];

  it('round-trips the snapshot sorted by path, with the evidence the journal keeps', () => {
    const encoded = encodeSnapshot(entries);
    expect(encoded.pathCount).toBe(2);
    expect(encoded.bytes).toBe(Buffer.byteLength(encoded.text, 'utf8'));
    expect(decodeSnapshot(encoded.text).map((entry) => entry.path)).toEqual(['a.md', 'b.yaml']);
    expect(decodeSnapshot(encoded.text)).toEqual([entries[1], entries[0]]);
    expect(encodeSnapshot([...entries].reverse()).sha256).toBe(encoded.sha256);
  });

  it('rejects a snapshot that is not the one this Engine wrote', () => {
    const good = JSON.parse(encodeSnapshot(entries).text) as Record<string, unknown>;
    const bad = [
      'not json',
      '[]',
      JSON.stringify({ ...good, version: 2 }),
      JSON.stringify({ ...good, entries: [] }),
      JSON.stringify({ ...good, extra: 1 }),
      JSON.stringify({ ...good, entries: [{ ...entries[0], extra: 1 }] }),
      JSON.stringify({ ...good, entries: [{ ...entries[0], owner: 'nobody' }] }),
      JSON.stringify({ ...good, entries: [{ ...entries[0], postSha256: 'short' }] }),
      JSON.stringify({ ...good, entries: [{ ...entries[0], path: '' }] }),
      JSON.stringify({ ...good, entries: [entries[0], entries[0]] }),
      JSON.stringify({ ...good, entries: [{ ...entries[0], operationCount: -1 }] }),
    ];
    for (const text of bad) {
      expect(() => decodeSnapshot(text)).toThrow(
        expect.objectContaining({ code: 'DOCUMENT_RECOVERY_REQUIRED' }),
      );
    }
  });

  it('round-trips the message and rejects an empty subject', () => {
    const encoded = encodeMessage({ subject: 'S', body: 'b\nc' });
    expect(decodeMessage(encoded.text)).toEqual({ subject: 'S', body: 'b\nc' });
    expect(() => decodeMessage(JSON.stringify({ subject: '', body: '' }))).toThrow();
    expect(() => decodeMessage('x')).toThrow();
  });
});
