// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthStore } from '../../../auth/store';
import { createSessionOperationStorage } from './createOperationStorage';
import { readUnfinishedCreate } from './unfinishedCreate';

const operationId = '11111111-1111-4111-8111-111111111111';
const authStore = { getState: () => ({ status: 'loading' }) } as unknown as AuthStore;
const ledger = () => createSessionOperationStorage('unknown', sessionStorage);

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe('readUnfinishedCreate', () => {
  it('is absent when no Create is unfinished', () => {
    expect(readUnfinishedCreate(authStore)).toBeUndefined();
  });

  it('reports the operation and the typed name from the client-side ledger', () => {
    ledger().save({ request: { title: '  Payment limits ', operationId }, startedAt: 1 });
    expect(readUnfinishedCreate(authStore)).toEqual({ operationId, title: 'Payment limits' });
  });

  it('names no specification when the request carries no name', () => {
    ledger().save({ request: { title: ' ', operationId }, startedAt: 1 });
    expect(readUnfinishedCreate(authStore)).toEqual({ operationId });
  });

  it('disappears once the operation is released (completed, refused or dismissed)', () => {
    ledger().save({ request: { title: 'Payment limits', operationId }, startedAt: 1 });
    expect(readUnfinishedCreate(authStore)).toBeDefined();
    ledger().clear();
    expect(readUnfinishedCreate(authStore)).toBeUndefined();
  });
});
