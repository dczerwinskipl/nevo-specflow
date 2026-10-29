import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DocumentIdError,
  allocateDocumentId,
  base32Lower,
  deriveUnclassifiedDocumentId,
  isDerivedDocumentId,
  isRegisteredDocumentId,
} from './document-ids';

const SPEC_ID = '11111111-2222-4333-8444-555555555555';

function expectedSuffix(position: number, length = 6): string {
  const digest = createHash('sha256').update(`${SPEC_ID}:${position}`).digest();

  return base32Lower(digest).slice(0, length);
}

describe('base32Lower', () => {
  it('matches RFC 4648 vectors in lowercase without padding', () => {
    const encode = (text: string) => base32Lower(new TextEncoder().encode(text));
    expect(encode('')).toBe('');
    expect(encode('f')).toBe('my');
    expect(encode('fo')).toBe('mzxq');
    expect(encode('foo')).toBe('mzxw6');
    expect(encode('foobar')).toBe('mzxw6ytboi');
  });
});

describe('allocateDocumentId', () => {
  it('gives the first document of a type its type id', () => {
    expect(
      allocateDocumentId({ specId: SPEC_ID, type: 'overview', position: 0, existingIds: [] }),
    ).toBe('overview');
  });

  it('suffixes later documents deterministically from specId and position', () => {
    const first = allocateDocumentId({
      specId: SPEC_ID,
      type: 'behaviour',
      position: 3,
      existingIds: ['behaviour'],
    });
    expect(first).toBe(`behaviour-${expectedSuffix(3)}`);
    expect(first).toMatch(/^behaviour-[a-z2-7]{6}$/u);
    expect(
      allocateDocumentId({
        specId: SPEC_ID,
        type: 'behaviour',
        position: 3,
        existingIds: ['behaviour'],
      }),
    ).toBe(first);
  });

  it('extends the suffix one character at a time on collision', () => {
    const six = `note-${expectedSuffix(2)}`;
    const seven = `note-${expectedSuffix(2, 7)}`;
    expect(
      allocateDocumentId({
        specId: SPEC_ID,
        type: 'note',
        position: 2,
        existingIds: ['note', six],
      }),
    ).toBe(seven);
    expect(
      allocateDocumentId({
        specId: SPEC_ID,
        type: 'note',
        position: 2,
        existingIds: ['note', six, seven],
      }),
    ).toBe(`note-${expectedSuffix(2, 8)}`);
  });

  it('never reuses an id it is told is taken, including the plain type id', () => {
    expect(
      allocateDocumentId({ specId: SPEC_ID, type: 'ux', position: 1, existingIds: ['ux'] }),
    ).not.toBe('ux');
  });

  it('never allocates an id in the reserved u- space', () => {
    expect(() =>
      allocateDocumentId({ specId: SPEC_ID, type: 'u-thing', position: 1, existingIds: [] }),
    ).toThrow(DocumentIdError);
    expect(() =>
      allocateDocumentId({ specId: SPEC_ID, type: 'u', position: 1, existingIds: ['u'] }),
    ).toThrow(DocumentIdError);
    expect(() =>
      allocateDocumentId({ specId: SPEC_ID, type: 'u', position: 0, existingIds: [] }),
    ).toThrow(DocumentIdError);
  });

  it('matches frozen known-answer vectors', () => {
    const allocate = (specId: string, position: number, existingIds: string[]) =>
      allocateDocumentId({ specId, type: 'behaviour', position, existingIds });
    expect(allocate(SPEC_ID, 3, ['behaviour'])).toBe('behaviour-3qeltn');
    expect(allocate(SPEC_ID, 3, ['behaviour', 'behaviour-3qeltn'])).toBe('behaviour-3qeltne');
    expect(allocate(SPEC_ID, 3, ['behaviour', 'behaviour-3qeltn', 'behaviour-3qeltne'])).toBe(
      'behaviour-3qeltnew',
    );
    expect(allocate('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 1, ['behaviour'])).toBe(
      'behaviour-eby67h',
    );
    expect(deriveUnclassifiedDocumentId('research/Notes.md')).toBe(
      'u-05ace8fecc34d7bbd2b6069b57742a69',
    );
  });

  it('produces ids accepted by the registered id rule', () => {
    const id = allocateDocumentId({
      specId: SPEC_ID,
      type: 'architecture',
      position: 7,
      existingIds: ['architecture'],
    });
    expect(isRegisteredDocumentId(id)).toBe(true);
    expect(isDerivedDocumentId(id)).toBe(false);
  });
});

describe('deriveUnclassifiedDocumentId', () => {
  it('uses u- and the first 32 hex of sha256 of the exact path', () => {
    const id = deriveUnclassifiedDocumentId('research/Notes.md');
    expect(id).toBe(
      `u-${createHash('sha256').update('research/Notes.md').digest('hex').slice(0, 32)}`,
    );
    expect(id).toMatch(/^u-[0-9a-f]{32}$/u);
  });

  it('preserves case so A.md and a.md have different ids', () => {
    expect(deriveUnclassifiedDocumentId('A.md')).not.toBe(deriveUnclassifiedDocumentId('a.md'));
    expect(deriveUnclassifiedDocumentId('A.md')).toBe(deriveUnclassifiedDocumentId('A.md'));
  });
});

describe('isRegisteredDocumentId', () => {
  it.each(['overview', 'behaviour-abc234', 'a', '0abc', 'x'.repeat(64)])('accepts %s', (id) => {
    expect(isRegisteredDocumentId(id)).toBe(true);
  });

  it.each(['', 'Overview', '-a', 'a_b', 'u-0123456789abcdef', 'u-x', 'x'.repeat(65)])(
    'rejects %j',
    (id) => {
      expect(isRegisteredDocumentId(id)).toBe(false);
    },
  );
});
