// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthStore, AuthStoreState } from '../../../../auth/store';
import { createSpecFlowAppServices } from '../../../../services';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { createSessionOperationStorage, useCreateOperationStorage } from './createOperationStorage';
import { archetypeSelectionFixture } from '../workspace/model/createRequest.test-support';

const operation = {
  request: {
    title: 'T',
    operationId: '11111111-1111-4111-8111-111111111111',
    ...archetypeSelectionFixture,
  },
  startedAt: 1,
};
const session = {
  authenticationRequired: true,
  authenticated: true,
  user: { id: 'u1' },
} as never;

function setup(initial: AuthStoreState) {
  let state = initial;
  const authStore = {
    getState: () => state,
    subscribe: () => () => undefined,
  } as unknown as AuthStore;
  const services = createSpecFlowAppServices({ authStore });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestServicesRouterContext services={services}>{children}</TestServicesRouterContext>
  );

  return { wrapper, set: (next: AuthStoreState) => (state = next) };
}

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe('useCreateOperationStorage', () => {
  it('keeps addressing the entry of the identity it opened with when the session is briefly not ready', () => {
    const { wrapper, set } = setup({ status: 'ready', session });
    const { result, rerender } = renderHook(() => useCreateOperationStorage(), { wrapper });
    result.current.save(operation);

    set({ status: 'loading' });
    rerender();
    expect(result.current.load(operation.request.operationId)).toEqual(operation);
    result.current.clear(operation.request.operationId);

    const sameIdentity = createSessionOperationStorage(
      'required:authenticated:user:u1',
      sessionStorage,
    );
    expect(sameIdentity.load(operation.request.operationId)).toBeUndefined();
  });
});
