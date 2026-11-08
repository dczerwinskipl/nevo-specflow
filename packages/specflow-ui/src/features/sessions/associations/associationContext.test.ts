import { describe, expect, it } from 'vitest';
import type { SessionAssociationRead } from '@nevo/specflow-contracts/sessions';
import { associationContext } from './associationContext';

type Association = Extract<SessionAssociationRead['association'], { kind: 'specification' }>;

const spec = {
  state: 'available',
  value: { specId: 'auth', key: 'SPEC-1', title: 'Auth', collection: 'current' },
} as const;

const read = (association: SessionAssociationRead['association']) =>
  associationContext({ status: 'success', data: { sessionId: 's1', association } });
const associated = (
  specification: Association['specification'],
  tasks: Association['tasks'] = [],
) => read({ kind: 'specification', specification, tasks });

describe('associationContext', () => {
  it('shows nothing while the read is in flight and one panel note when it failed', () => {
    expect(associationContext({ status: 'pending' })).toEqual({
      scope: { kind: 'unknown', reason: 'loading' },
    });
    expect(associationContext({ status: 'error' })).toEqual({
      scope: { kind: 'unknown', reason: 'unreadable' },
    });
  });

  it('gives a standalone Session no Specification and no Tasks', () => {
    expect(read({ kind: 'standalone' })).toEqual({ scope: { kind: 'standalone' } });
  });

  it('maps an available Specification and its Tasks to Related Tasks, never execution', () => {
    const value = associated(spec, [
      { state: 'available', value: { taskId: 't1', key: 'TASK-1', title: 'Login' } },
      { state: 'available', value: { taskId: 't2', title: 'Logout' } },
    ]);

    expect(value).toEqual({
      scope: { kind: 'specification' },
      specification: {
        status: 'ready',
        value: { id: 'auth', key: 'SPEC-1', title: 'Auth', collection: 'current' },
      },
      relatedTasks: {
        status: 'ready',
        value: [
          { id: 't1', key: 'TASK-1', title: 'Login' },
          { id: 't2', key: 't2', title: 'Logout' },
        ],
      },
    });
    expect(value).not.toHaveProperty('executionScope');
    expect(value).not.toHaveProperty('attention');
  });

  it('keeps the collection of an archived Specification', () => {
    const value = associated({ ...spec, value: { ...spec.value, collection: 'archived' } });

    expect(value.specification).toMatchObject({ value: { collection: 'archived' } });
  });

  it('counts missing Tasks beside the found ones', () => {
    const value = associated(spec, [
      { state: 'available', value: { taskId: 't1', title: 'Login' } },
      { state: 'missing', id: 't2' },
    ]);

    expect(value.relatedTasks).toEqual({
      status: 'ready',
      value: [{ id: 't1', key: 't1', title: 'Login' }],
    });
    expect(value.relatedTasksMissing).toEqual({ count: 1, total: 2 });
  });

  it('reports unreadable Tasks as one note', () => {
    const value = associated(spec, [
      { state: 'available', value: { taskId: 't1', title: 'Login' } },
      { state: 'unavailable' },
    ]);

    expect(value.relatedTasks).toEqual({ status: 'unreadable' });
    expect(value).not.toHaveProperty('relatedTasksMissing');
  });

  it.each([
    [{ state: 'forbidden' } as const, { status: 'forbidden' }],
    [{ state: 'missing', id: 'auth' } as const, { status: 'missing', ref: { key: 'auth' } }],
    [{ state: 'unavailable' } as const, { status: 'unreadable' }],
  ])('maps a Specification %o without any Tasks section', (specification, fact) => {
    expect(associated(specification, [{ state: 'missing', id: 't1' }])).toEqual({
      scope: { kind: 'specification' },
      specification: fact,
    });
  });
});
