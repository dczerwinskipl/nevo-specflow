import { describe, expect, it } from 'vitest';
import type { SessionAssociationRead } from '@nevo/specflow-contracts/sessions';
import { homeSpecification } from './useSessionHomeSpecification';

const value = { specId: 'spec-s', title: 'Auth', collection: 'current' } as const;
const associated = (
  specification: Extract<
    SessionAssociationRead['association'],
    { kind: 'specification' }
  >['specification'],
): SessionAssociationRead => ({
  sessionId: 's1',
  association: { kind: 'specification', specification, tasks: [] },
});

describe('the home Specification of a Session (navigator, delete destination)', () => {
  it('is the associated Specification when it is available', () => {
    expect(homeSpecification(associated({ state: 'available', value }))).toEqual(value);
  });

  it.each([
    ['standalone', { sessionId: 's1', association: { kind: 'standalone' } } as const],
    ['forbidden', associated({ state: 'forbidden' })],
    ['missing', associated({ state: 'missing', id: 'spec-s' })],
    ['unavailable', associated({ state: 'unavailable' })],
    ['not read', undefined],
  ])('is none for a %s association', (_case, read) => {
    expect(homeSpecification(read)).toBeUndefined();
  });
});
