import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import {
  ListAssociationSchema,
  SessionListFilterSchema,
  SessionListItemSchema,
  SessionListPageSchema,
  SessionListQuerySchema,
} from './list';

const id = '10000000-0000-4000-8000-000000000001';
const date = '2026-11-08T00:00:00.000Z';
const item = {
  sessionId: id,
  providerId: 'mock',
  readiness: 'ready',
  createdAt: date,
  updatedAt: date,
  association: { kind: 'standalone' },
};

describe('Session list contract', () => {
  it('keeps specId and standalone exclusive and requires specId for taskId', () => {
    const check = (filter: unknown) => Value.Check(SessionListFilterSchema, filter);
    expect(check({ archived: 'exclude' })).toBe(true);
    expect(check({ specId: 'S1', archived: 'include' })).toBe(true);
    expect(check({ specId: 'S1', taskId: 'T1', archived: 'only' })).toBe(true);
    expect(check({ standalone: true, archived: 'exclude' })).toBe(true);
    expect(check({ specId: 'S1', standalone: true, archived: 'exclude' })).toBe(false);
    expect(check({ taskId: 'T1', archived: 'exclude' })).toBe(false);
    expect(check({ standalone: true, taskId: 'T1', archived: 'exclude' })).toBe(false);
    expect(check({ standalone: false, archived: 'exclude' })).toBe(false);
    expect(check({ specId: 'S1' })).toBe(false);
    expect(check({ archived: 'all' })).toBe(false);
  });

  it('bounds the query limit to 1..100 and rejects unknown parameters', () => {
    expect(Value.Check(SessionListQuerySchema, {})).toBe(true);
    expect(Value.Check(SessionListQuerySchema, { limit: 100, cursor: 'c' })).toBe(true);
    expect(Value.Check(SessionListQuerySchema, { limit: 0 })).toBe(false);
    expect(Value.Check(SessionListQuerySchema, { limit: 101 })).toBe(false);
    expect(Value.Check(SessionListQuerySchema, { projectId: 'P' })).toBe(false);
  });

  it('lets a restricted association carry no identifier', () => {
    expect(Value.Check(ListAssociationSchema, { kind: 'restricted' })).toBe(true);
    expect(Value.Check(ListAssociationSchema, { kind: 'restricted', specId: 'S1' })).toBe(false);
    expect(Value.Check(ListAssociationSchema, { kind: 'restricted', taskIds: [] })).toBe(false);
    expect(
      Value.Check(ListAssociationSchema, { kind: 'specification', specId: 'S1', taskIds: ['T1'] }),
    ).toBe(true);
    expect(Value.Check(ListAssociationSchema, { kind: 'specification', specId: 'S1' })).toBe(false);
  });

  it('describes closed list items and pages that may be short while a cursor remains', () => {
    expect(Value.Check(SessionListItemSchema, item)).toBe(true);
    expect(
      Value.Check(SessionListItemSchema, {
        ...item,
        title: 'Plan',
        modelId: 'm',
        archivedAt: date,
        activeTurn: { turnId: id, state: 'active' },
      }),
    ).toBe(true);
    expect(Value.Check(SessionListItemSchema, { ...item, projectId: 'P' })).toBe(false);
    expect(Value.Check(SessionListPageSchema, { items: [], nextCursor: 'c' })).toBe(true);
    expect(Value.Check(SessionListPageSchema, { items: [item] })).toBe(true);
  });
});
