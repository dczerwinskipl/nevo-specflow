import { describe, expect, it } from 'vitest';

import { ledgerRevisionOf } from '../durable/ledger/revision';
import {
  closureOf,
  editedSince,
  fingerprintOfRequest,
  revisionOfScope,
  selectEntries,
  type ScopeEntry,
  type WorkingContent,
} from './selection';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

function entry(path: string, operationIds: string[], post: string | null = A): ScopeEntry {
  return {
    owner: 'definitions',
    path,
    postSha256: post,
    operationIds,
    operationCount: operationIds.length,
    recordedAt: '2026-10-27T10:00:00.000Z',
    reason: 'auto-commit-off',
  };
}

describe('closureOf', () => {
  const entries = [
    entry('a.md', ['op-1']),
    entry('b.md', ['op-1', 'op-2']),
    entry('c.md', ['op-2']),
    entry('d.md', ['op-3']),
    entry('e.md', []),
  ];

  it('adds every path that shares an operation with a selected one, transitively', () => {
    expect(closureOf(entries, ['a.md'])).toEqual(['a.md', 'b.md', 'c.md']);
    expect(closureOf(entries, ['c.md'])).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('leaves independent paths alone', () => {
    expect(closureOf(entries, ['d.md'])).toEqual(['d.md']);
    expect(closureOf(entries, ['e.md'])).toEqual(['e.md']);
    expect(closureOf(entries, ['d.md', 'e.md'])).toEqual(['d.md', 'e.md']);
  });

  it('is sorted and does not depend on the order of the seed', () => {
    expect(closureOf(entries, ['c.md', 'a.md'])).toEqual(closureOf(entries, ['a.md']));
  });
});

describe('closureOf with forgotten operation ids', () => {
  it('returns the whole scope when an entry kept fewer ids than operations', () => {
    const truncated = { ...entry('a.md', ['op-51']), operationCount: 51 };
    const entries = [truncated, entry('b.md', ['op-51']), entry('c.md', ['op-9'])];
    expect(closureOf(entries, ['c.md'])).toEqual(['a.md', 'b.md', 'c.md']);
    expect(selectEntries(entries, ['c.md'])).toEqual({
      ok: false,
      kind: 'not-closed',
      paths: ['a.md', 'b.md', 'c.md'],
    });
    expect(selectEntries(entries, ['a.md', 'b.md', 'c.md'])).toMatchObject({ ok: true });
  });
});

describe('selectEntries', () => {
  const entries = [
    entry('a.md', ['op-1']),
    entry('b.md', ['op-1']),
    entry('c.md', ['op-2']),
    entry('d.md', ['op-2', 'op-3']),
    entry('e.md', ['op-3']),
  ];

  it('selects every entry without a subset', () => {
    expect(selectEntries(entries, undefined)).toEqual({ ok: true, selected: entries });
  });

  it('selects a subset that is closed under shared operations, in ledger order', () => {
    const check = selectEntries(entries, ['b.md', 'a.md']);
    expect(check).toEqual({ ok: true, selected: [entries[0], entries[1]] });
  });

  it('accepts duplicates in the request', () => {
    expect(selectEntries(entries, ['a.md', 'a.md', 'b.md'])).toMatchObject({ ok: true });
  });

  it('names the closure a subset needs, through a chain of operations', () => {
    expect(selectEntries(entries, ['c.md'])).toEqual({
      ok: false,
      kind: 'not-closed',
      paths: ['c.md', 'd.md', 'e.md'],
    });
    expect(selectEntries(entries, ['a.md'])).toEqual({
      ok: false,
      kind: 'not-closed',
      paths: ['a.md', 'b.md'],
    });
  });

  it('names the paths that are not in the ledger first', () => {
    expect(selectEntries(entries, ['a.md', 'zzz.md', 'b.md', 'aaa.md'])).toEqual({
      ok: false,
      kind: 'unknown-path',
      paths: ['aaa.md', 'zzz.md'],
    });
  });

  it('never selects a path outside the entries, whatever the subset names', () => {
    for (const subset of [['.nevo/config.yaml'], ['../x'], ['a.md', 'x/../a.md']]) {
      const check = selectEntries(entries, subset);
      expect(check.ok).toBe(false);
    }
  });
});

describe('editedSince', () => {
  const entries = [entry('a.md', [], A), entry('b.md', [], B), entry('gone.md', [], null)];
  const working = (values: Record<string, WorkingContent>): Map<string, WorkingContent> =>
    new Map(Object.entries(values));

  it('is empty when every path holds its post-image, a removed one being absent', () => {
    expect(editedSince(entries, working({ 'a.md': A, 'b.md': B, 'gone.md': null }))).toEqual([]);
  });

  it('lists a changed, a returned and an unreadable path, sorted', () => {
    expect(editedSince(entries, working({ 'a.md': C, 'b.md': B, 'gone.md': A }))).toEqual([
      'a.md',
      'gone.md',
    ]);
    expect(
      editedSince(entries, working({ 'a.md': undefined, 'b.md': null, 'gone.md': null })),
    ).toEqual(['a.md', 'b.md']);
  });

  it('counts a path that was not read as edited', () => {
    expect(editedSince(entries, working({ 'a.md': A, 'gone.md': null }))).toEqual(['b.md']);
  });
});

describe('the revision of a scope', () => {
  it('is the ledger revision: stable, order independent and sensitive to every entry', () => {
    const one = [entry('a.md', ['x'], A), entry('b.md', ['y'], B)];
    const two = [entry('b.md', ['y'], B), entry('a.md', ['x'], A)];
    expect(revisionOfScope(one)).toBe(revisionOfScope(two));
    expect(revisionOfScope(one)).toBe(ledgerRevisionOf(one));
    expect(revisionOfScope([entry('a.md', [], A)])).not.toBe(revisionOfScope(one));
    expect(revisionOfScope([entry('a.md', [], C), entry('b.md', [], B)])).not.toBe(
      revisionOfScope(one),
    );
  });
});

describe('the fingerprint of a request', () => {
  const base = {
    scope: 'specification',
    specId: 'spec-1',
    message: 'subject\n\nbody',
    paths: ['b.md', 'a.md'],
    ledgerRevision: 'rev',
  };

  it('ignores the order and the duplicates of the paths', () => {
    expect(fingerprintOfRequest(base)).toBe(
      fingerprintOfRequest({ ...base, paths: ['a.md', 'b.md', 'a.md'] }),
    );
  });

  it('changes with every part of the request', () => {
    const reference = fingerprintOfRequest(base);
    for (const changed of [
      { ...base, scope: 'all' },
      { ...base, specId: 'spec-2' },
      { ...base, specId: undefined },
      { ...base, message: 'other' },
      { ...base, paths: ['a.md'] },
      { ...base, paths: undefined },
      { ...base, ledgerRevision: undefined },
      { ...base, ledgerRevision: 'other' },
    ]) {
      expect(fingerprintOfRequest(changed)).not.toBe(reference);
    }
  });

  it('tells no paths from an empty list of paths', () => {
    expect(fingerprintOfRequest({ ...base, paths: undefined })).not.toBe(
      fingerprintOfRequest({ ...base, paths: [] }),
    );
  });
});
