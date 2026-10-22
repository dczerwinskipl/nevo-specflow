// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createSessionOperationStorage } from './createOperationStorage';
import { useUnfinishedCreate } from './useUnfinishedCreate';

const operationId = '11111111-1111-4111-8111-111111111111';
const services = createSpecFlowAppServices({});
const wrapper = ({ children }: { children: ReactNode }) => (
  <TestServicesRouterContext services={services}>{children}</TestServicesRouterContext>
);
const ledger = () => createSessionOperationStorage('unknown', sessionStorage);

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe('useUnfinishedCreate', () => {
  it('is absent when no Create is unfinished', () => {
    expect(renderHook(() => useUnfinishedCreate(), { wrapper }).result.current).toBeUndefined();
  });

  it('reports the operation and the typed name from the client-side ledger', () => {
    ledger().save({ request: { title: '  Payment limits ', operationId }, startedAt: 1 });
    expect(renderHook(() => useUnfinishedCreate(), { wrapper }).result.current).toEqual({
      operationId,
      title: 'Payment limits',
    });
  });

  it('disappears once the operation is released (completed, refused or dismissed)', () => {
    ledger().save({ request: { title: 'Payment limits', operationId }, startedAt: 1 });
    expect(renderHook(() => useUnfinishedCreate(), { wrapper }).result.current).toBeDefined();
    ledger().clear();
    expect(renderHook(() => useUnfinishedCreate(), { wrapper }).result.current).toBeUndefined();
  });
});
