import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import {
  CREATE_RESPOND_ASYNC_PREFERENCE,
  CreateOperationAcceptedSchema,
  CreateOperationInspectionSchema,
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
