import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { DOCUMENT_ERROR_CODES } from '../documents';
import {
  CREATE_RESPOND_ASYNC_PREFERENCE,
  CreateOperationAcceptedSchema,
  CreateOperationInspectionSchema,
  CreateSpecErrorSchema,
  CreateSpecRequestSchema,
  CreatedSpecSchema,
} from './create';

const operationId = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';

describe('Create async acceptance contract', () => {
  it('names the RFC 7240 preference token', () => {
    expect(CREATE_RESPOND_ASYNC_PREFERENCE).toBe('respond-async');
  });

  it('accepts only an in-progress body and nothing else', () => {
    const accepted = { operationId, kind: 'specification-create', status: 'in-progress' };
    expect(Value.Check(CreateOperationAcceptedSchema, accepted)).toBe(true);
    expect(Value.Check(CreateOperationAcceptedSchema, { ...accepted, status: 'completed' })).toBe(
      false,
    );
    expect(Value.Check(CreateOperationAcceptedSchema, { ...accepted, path: 'C:/secret' })).toBe(
      false,
    );
  });

  it('is the in-progress shape of the inspection endpoint', () => {
    const accepted = { operationId, kind: 'specification-create', status: 'in-progress' };
    expect(Value.Check(CreateOperationInspectionSchema, accepted)).toBe(true);
  });
});

describe('Create request with an archetype', () => {
  const request = {
    title: 'Checkout',
    archetypeId: 'feature',
    archetypeVersion: 1,
    catalogueRevision: 'abc123',
  };

  it('accepts the minimal request and the optional archetype fields', () => {
    expect(Value.Check(CreateSpecRequestSchema, request)).toBe(true);
    expect(
      Value.Check(CreateSpecRequestSchema, {
        ...request,
        goal: 'Pay',
        optionalDocumentIds: ['user-story', 'design'],
        addedDocuments: [
          { path: 'notes/a.md', type: 'note', content: 'x' },
          { path: 'b.md', content: '' },
        ],
        folders: ['assets'],
      }),
    ).toBe(true);
  });

  it.each(['archetypeId', 'archetypeVersion', 'catalogueRevision'])(
    'requires %s: there is no default archetype',
    (key) => {
      const { [key]: _omitted, ...rest } = request as Record<string, unknown>;
      expect(Value.Check(CreateSpecRequestSchema, rest)).toBe(false);
    },
  );

  it('rejects a string version, duplicates, an unknown key and a stored title field', () => {
    expect(Value.Check(CreateSpecRequestSchema, { ...request, archetypeVersion: '1' })).toBe(false);
    expect(Value.Check(CreateSpecRequestSchema, { ...request, archetypeVersion: 0 })).toBe(false);
    expect(
      Value.Check(CreateSpecRequestSchema, {
        ...request,
        optionalDocumentIds: ['design', 'design'],
      }),
    ).toBe(false);
    expect(Value.Check(CreateSpecRequestSchema, { ...request, folders: ['a', 'a'] })).toBe(false);
    expect(Value.Check(CreateSpecRequestSchema, { ...request, extra: true })).toBe(false);
    expect(
      Value.Check(CreateSpecRequestSchema, {
        ...request,
        addedDocuments: [{ path: 'a.md', content: '', title: 'A' }],
      }),
    ).toBe(false);
  });

  it('returns the registered document ids and requires them', () => {
    const created = {
      operationId,
      specId: '0b0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60',
      kind: 'specification-create',
      status: 'completed',
      slug: 'checkout',
      workspaceId: '1c0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60',
      relativeManifestPath: 'specs/checkout/specification.yaml',
      documentIds: ['overview'],
    };
    expect(Value.Check(CreatedSpecSchema, created)).toBe(true);
    expect(Value.Check(CreateOperationInspectionSchema, created)).toBe(true);
    const { documentIds: _ids, ...without } = created;
    expect(Value.Check(CreatedSpecSchema, without)).toBe(false);
  });

  it('carries the cause of a document error in the details of the Create error body', () => {
    expect(
      Value.Check(CreateSpecErrorSchema, {
        error: 'DEFINITIONS_MISSING',
        code: 'DEFINITIONS_MISSING',
        details: { cause: 'definitions-missing' },
      }),
    ).toBe(true);
    expect(
      Value.Check(CreateSpecErrorSchema, { error: 'x', code: 'y', details: { cause: 1 } }),
    ).toBe(false);
  });

  it('carries every document error code in the Create error body', () => {
    for (const code of DOCUMENT_ERROR_CODES) {
      expect(Value.Check(CreateSpecErrorSchema, { error: 'x', code })).toBe(true);
    }
  });
});
