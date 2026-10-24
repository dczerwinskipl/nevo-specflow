import { describe, expect, it } from 'vitest';

import {
  fingerprintCreateClientIntent,
  normalizeCreateClientIntent,
  normalizePersistedCreateIntent,
  sha256Utf8,
  type CreateClientIntentInput,
} from './intent';

const base: CreateClientIntentInput = {
  title: 'Checkout',
  archetype: { id: 'feature', version: 1 },
  target: { kind: 'existing', workspaceId: '11111111-1111-4111-8111-111111111111' },
};

describe('Create intent with an archetype', () => {
  it('normalises suggestions and folders to sorted unique lists and keeps request order of added files', () => {
    const intent = normalizeCreateClientIntent({
      ...base,
      optionalDocumentIds: ['ux', 'backend', 'ux'],
      folders: ['b', 'a', 'b'],
      addedDocuments: [
        { path: 'z.md', content: 'z' },
        { path: 'a.md', type: 'note', content: 'a' },
      ],
    });
    expect(intent.optionalDocumentIds).toEqual(['backend', 'ux']);
    expect(intent.folders).toEqual(['a', 'b']);
    expect(intent.addedDocuments.map((document) => document.path)).toEqual(['z.md', 'a.md']);
  });

  it('keeps added contents out of the intent and records path, type, sha256 and UTF-8 bytes', () => {
    const content = 'zażółć';
    const intent = normalizeCreateClientIntent({
      ...base,
      addedDocuments: [{ path: 'n.md', type: 'note', content }],
    });
    expect(intent.addedDocuments).toEqual([
      { path: 'n.md', type: 'note', sha256: sha256Utf8(content), bytes: 10 },
    ]);
    expect(JSON.stringify(intent)).not.toContain(content);
  });

  it('measures content in bytes, not characters', () => {
    const intent = normalizeCreateClientIntent({
      ...base,
      addedDocuments: [{ path: 'n.md', content: '€' }],
    });
    expect(intent.addedDocuments[0]?.bytes).toBe(3);
  });

  it('omits an absent type and an absent revision instead of writing undefined', () => {
    const intent = normalizeCreateClientIntent({
      ...base,
      addedDocuments: [{ path: 'n.md', content: '' }],
    });
    expect(Object.keys(intent.addedDocuments[0]!)).toEqual(['path', 'sha256', 'bytes']);
    expect('catalogueRevision' in intent).toBe(false);
  });

  it('round-trips through its persisted form unchanged', () => {
    const intent = normalizeCreateClientIntent({
      ...base,
      catalogueRevision: 'rev',
      optionalDocumentIds: ['ux'],
      folders: ['assets'],
      addedDocuments: [{ path: 'n.md', type: 'note', content: 'x' }],
    });
    const persisted = JSON.parse(JSON.stringify(intent)) as typeof intent;
    expect(JSON.stringify(normalizePersistedCreateIntent(persisted))).toBe(JSON.stringify(intent));
  });

  it('rejects a malformed archetype selection before anything is reserved', () => {
    for (const archetype of [
      { id: '', version: 1 },
      { id: 'feature', version: 0 },
      { id: 'feature', version: 1.5 },
    ]) {
      expect(() => normalizeCreateClientIntent({ ...base, archetype })).toThrowError(
        expect.objectContaining({ code: 'CREATE_OPERATION_INVALID' }),
      );
    }
  });

  describe('fingerprint', () => {
    const fingerprint = (patch: Partial<CreateClientIntentInput>) =>
      fingerprintCreateClientIntent(normalizeCreateClientIntent({ ...base, ...patch }));

    it('is equal for the same request regardless of list order and duplicates', () => {
      expect(fingerprint({ optionalDocumentIds: ['ux', 'backend'], folders: ['b', 'a'] })).toBe(
        fingerprint({ optionalDocumentIds: ['backend', 'ux', 'ux'], folders: ['a', 'b'] }),
      );
    });

    it.each<[string, Partial<CreateClientIntentInput>]>([
      ['archetype id', { archetype: { id: 'minimal', version: 1 } }],
      ['archetype version', { archetype: { id: 'feature', version: 2 } }],
      ['suggestions', { optionalDocumentIds: ['ux'] }],
      ['folders', { folders: ['assets'] }],
      ['added path', { addedDocuments: [{ path: 'a.md', content: 'x' }] }],
    ])('changes with the %s', (_name, patch) => {
      expect(fingerprint(patch)).not.toBe(fingerprint({}));
    });

    it('does not depend on the catalogue revision, which is only a precondition', () => {
      expect(fingerprint({ catalogueRevision: 'one' })).toBe(
        fingerprint({ catalogueRevision: 'two' }),
      );
      expect(fingerprint({ catalogueRevision: 'one' })).toBe(fingerprint({}));
    });

    it('covers the type and the content of an added document', () => {
      const reference = fingerprint({ addedDocuments: [{ path: 'a.md', content: 'x' }] });
      expect(
        fingerprint({ addedDocuments: [{ path: 'a.md', type: 'note', content: 'x' }] }),
      ).not.toBe(reference);
      expect(fingerprint({ addedDocuments: [{ path: 'a.md', content: 'y' }] })).not.toBe(reference);
      expect(fingerprint({ addedDocuments: [{ path: 'a.md', content: 'x' }] })).toBe(reference);
    });
  });
});
