import { describe, expect, it } from 'vitest';

import { getBuiltInCatalogue } from '../archetypes/catalogue';
import { ADDED_DOCUMENTS_MAX_FILES, TEXT_CONTENT_MAX_BYTES } from '../documents/limits';
import { admitCreateArchetype } from './admission';
import { normalizeCreateClientIntent, type CreateClientIntentInput } from './intent';

const catalogue = getBuiltInCatalogue();
const target = { kind: 'existing', workspaceId: '11111111-1111-4111-8111-111111111111' } as const;
const EURO = '€';

function admit(patch: Partial<CreateClientIntentInput> = {}): void {
  const input: CreateClientIntentInput = {
    title: 'Checkout',
    archetype: { id: 'feature', version: 1 },
    target,
    ...patch,
  };
  admitCreateArchetype(
    normalizeCreateClientIntent(input),
    (input.addedDocuments ?? []).map((document) => document.content),
  );
}

describe('Create admission of the archetype part', () => {
  it('accepts a valid request, with the current revision', () => {
    expect(() =>
      admit({
        catalogueRevision: catalogue.revision,
        optionalDocumentIds: ['ux'],
        addedDocuments: [{ path: 'notes/a.md', type: 'note', content: 'x' }],
        folders: ['assets'],
      }),
    ).not.toThrow();
  });

  it('accepts a request without a revision (checked only when present)', () => {
    expect(() => admit()).not.toThrow();
  });

  it('refuses a stale revision as CATALOGUE_STALE, ahead of any other refusal', () => {
    expect(() =>
      admit({ catalogueRevision: 'old', archetype: { id: 'gone', version: 9 } }),
    ).toThrowError(expect.objectContaining({ code: 'CATALOGUE_STALE' }));
  });

  it('refuses a stale archetype version as CATALOGUE_STALE', () => {
    expect(() => admit({ archetype: { id: 'feature', version: 2 } })).toThrowError(
      expect.objectContaining({ code: 'CATALOGUE_STALE' }),
    );
  });

  it('refuses an unknown archetype and an unknown or non-optional template as ARCHETYPE_UNKNOWN', () => {
    for (const patch of [
      { archetype: { id: 'nope', version: 1 } },
      { optionalDocumentIds: ['missing'] },
      { optionalDocumentIds: ['overview'] },
    ]) {
      expect(() => admit(patch)).toThrowError(
        expect.objectContaining({ code: 'ARCHETYPE_UNKNOWN' }),
      );
    }
  });

  it('refuses a reserved or invalid path as DOCUMENT_PATH_INVALID', () => {
    for (const path of ['specification.yaml', 'SPECIFICATION.YAML', '../x.md', 'a/CON.md', '']) {
      expect(() => admit({ addedDocuments: [{ path, content: '' }] })).toThrowError(
        expect.objectContaining({ code: 'DOCUMENT_PATH_INVALID' }),
      );
    }
  });

  it('refuses a case-insensitive duplicate as DOCUMENT_PATH_CONFLICT', () => {
    expect(() =>
      admit({
        addedDocuments: [
          { path: 'a.md', content: '' },
          { path: 'A.md', content: '' },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'DOCUMENT_PATH_CONFLICT' }));
    expect(() => admit({ addedDocuments: [{ path: 'OVERVIEW.md', content: '' }] })).toThrowError(
      expect.objectContaining({ code: 'DOCUMENT_PATH_CONFLICT' }),
    );
  });

  it('refuses counts and UTF-8 byte sizes above the limits as DOCUMENT_OPERATION_INVALID', () => {
    const tooMany = Array.from({ length: ADDED_DOCUMENTS_MAX_FILES + 1 }, (_, index) => ({
      path: `f${index}.md`,
      content: '',
    }));
    expect(() => admit({ addedDocuments: tooMany })).toThrowError(
      expect.objectContaining({ code: 'DOCUMENT_OPERATION_INVALID' }),
    );
    // Three bytes per character: under the limit in characters, over it in bytes.
    const fitting = Math.floor(TEXT_CONTENT_MAX_BYTES / 3);
    expect(fitting + 1).toBeLessThan(TEXT_CONTENT_MAX_BYTES);
    expect(() =>
      admit({ addedDocuments: [{ path: 'big.md', content: EURO.repeat(fitting + 1) }] }),
    ).toThrowError(expect.objectContaining({ code: 'DOCUMENT_OPERATION_INVALID' }));
    expect(() =>
      admit({ addedDocuments: [{ path: 'ok.md', content: EURO.repeat(fitting) }] }),
    ).not.toThrow();
  });

  it('refuses an added document type that cannot be registered as DOCUMENT_OPERATION_INVALID', () => {
    for (const type of ['u', 'u-abc', 'Bad Type']) {
      expect(() => admit({ addedDocuments: [{ path: 'a.md', type, content: '' }] })).toThrowError(
        expect.objectContaining({ code: 'DOCUMENT_OPERATION_INVALID' }),
      );
    }
  });

  it('refuses contents that do not match the intent evidence', () => {
    const intent = normalizeCreateClientIntent({
      title: 'Checkout',
      archetype: { id: 'feature', version: 1 },
      target,
      addedDocuments: [{ path: 'a.md', content: 'x' }],
    });
    expect(() => admitCreateArchetype(intent, ['y'])).toThrowError(
      expect.objectContaining({ code: 'CREATE_OPERATION_INVALID' }),
    );
    expect(() => admitCreateArchetype(intent, [])).toThrowError(
      expect.objectContaining({ code: 'CREATE_OPERATION_INVALID' }),
    );
  });
});
