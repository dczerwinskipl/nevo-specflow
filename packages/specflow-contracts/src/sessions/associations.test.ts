import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import {
  CreateContextSessionResultSchema,
  CreateContextSessionSchema,
  ProviderCatalogueQuerySchema,
  SessionAssociationReadSchema,
} from './associations';
import { SessionErrorSchema } from './commands';

const id = '10000000-0000-4000-8000-000000000001';
const create = { requestId: id, providerId: 'mock', mode: 'read-only' };

describe('Session association contract', () => {
  it('accepts a CreateSession body with optional unique Task ids of at most 32', () => {
    expect(Value.Check(CreateContextSessionSchema, create)).toBe(true);
    expect(Value.Check(CreateContextSessionSchema, { ...create, taskIds: ['T1', 'T2'] })).toBe(
      true,
    );
    const many = Array.from({ length: 32 }, (_, n) => `T${n}`);
    expect(Value.Check(CreateContextSessionSchema, { ...create, taskIds: many })).toBe(true);
    expect(Value.Check(CreateContextSessionSchema, { ...create, taskIds: [...many, 'T32'] })).toBe(
      false,
    );
    expect(Value.Check(CreateContextSessionSchema, { ...create, taskIds: ['T1', 'T1'] })).toBe(
      false,
    );
    expect(Value.Check(CreateContextSessionSchema, { ...create, taskIds: ['../x'] })).toBe(false);
  });

  it('closes the provider catalogue query to a bounded Specification or Session id', () => {
    const check = (query: unknown) => Value.Check(ProviderCatalogueQuerySchema, query);
    expect(check({})).toBe(true);
    expect(check({ specId: 'S1' })).toBe(true);
    expect(check({ sessionId: id })).toBe(true);
    expect(check({ specId: '../x' })).toBe(false);
    expect(check({ sessionId: 'not-a-session' })).toBe(false);
    expect(check({ projectId: 'project' })).toBe(false);
  });

  it('keeps the composed create body closed and never carries the Specification itself', () => {
    expect(Value.Check(CreateContextSessionSchema, { ...create, specId: 'S1' })).toBe(false);
    expect(Value.Check(CreateContextSessionSchema, { ...create, extra: true })).toBe(false);
  });

  it('returns the created Session with its association reference', () => {
    const result = { sessionId: id, association: { specId: 'S1', taskIds: ['T1'] } };
    expect(Value.Check(CreateContextSessionResultSchema, result)).toBe(true);
    expect(Value.Check(CreateContextSessionResultSchema, { sessionId: id })).toBe(false);
    expect(
      Value.Check(CreateContextSessionResultSchema, {
        ...result,
        association: { ...result.association, origin: 'user' },
      }),
    ).toBe(false);
  });

  it('reads standalone and Specification associations with every fact state', () => {
    const read = (association: unknown) =>
      Value.Check(SessionAssociationReadSchema, { sessionId: id, association });
    expect(read({ kind: 'standalone' })).toBe(true);
    expect(
      read({
        kind: 'specification',
        specification: {
          state: 'available',
          value: { specId: 'S1', key: 'UI-1', title: 'Spec', collection: 'archived' },
        },
        tasks: [
          { state: 'available', value: { taskId: 'T1', title: 'Task' } },
          { state: 'missing', id: 'T2' },
          { state: 'unavailable' },
        ],
      }),
    ).toBe(true);
    expect(read({ kind: 'specification', specification: { state: 'forbidden' }, tasks: [] })).toBe(
      true,
    );
  });

  it('keys the association read by a Session UUID in every Runtime mode', () => {
    const read = (sessionId: string) =>
      Value.Check(SessionAssociationReadSchema, {
        sessionId,
        association: { kind: 'standalone' },
      });
    expect(read('00000000-0000-4000-8000-000000000023')).toBe(true);
    expect(read('sample-session-23')).toBe(false);
    expect(read('../escape')).toBe(false);
    expect(read('')).toBe(false);
  });

  it('never lets a forbidden or unavailable fact carry an identifier', () => {
    const fact = (specification: unknown) =>
      Value.Check(SessionAssociationReadSchema, {
        sessionId: id,
        association: { kind: 'specification', specification, tasks: [] },
      });
    expect(fact({ state: 'forbidden', id: 'S1' })).toBe(false);
    expect(fact({ state: 'unavailable', id: 'S1' })).toBe(false);
    expect(fact({ state: 'missing' })).toBe(false);
  });

  it('declares SESSION_LIST_SCOPE_REQUIRED', () => {
    expect(
      Value.Check(SessionErrorSchema, {
        error: 'session_error',
        code: 'SESSION_LIST_SCOPE_REQUIRED',
        message: 'Pass specId.',
      }),
    ).toBe(true);
  });
});
