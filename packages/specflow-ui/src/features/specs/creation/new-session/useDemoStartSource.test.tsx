// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentChoice, SessionNameChoice } from '../../../sessions';
import type { CreateSubmitOutcome } from '../operation/useCreateDemoSpecification';

const hoisted = vi.hoisted(() => ({
  submit: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  onSession: { current: (_specId: string, _sessionId: string): void => undefined },
}));
const { submit } = hoisted;
const onSession = (specId: string, sessionId: string) =>
  hoisted.onSession.current(specId, sessionId);

vi.mock('../operation/useCreateDemoSpecification', () => ({
  useCreateDemoSpecification: (options: { onSession: (spec: string, session: string) => void }) => {
    hoisted.onSession.current = options.onSession;

    return {
      state: { failure: undefined, checking: false },
      flags: { unfinished: false, recovery: false, uncertain: false },
      actions: { submit, dismissFailure: vi.fn() },
    };
  },
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined, isPending: true, isError: false, refetch: vi.fn() }),
  useQueryClient: () => ({
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(() => Promise.resolve()),
  }),
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useBlocker: vi.fn(),
}));
vi.mock('../../../../app/useAppServices', () => ({
  useAppServices: () => ({ demoCreationApi: { catalogue: vi.fn() } }),
}));
vi.mock('../../../../app/useRuntimeMode', () => ({
  useRuntimeInfo: () => ({ isError: false, refetch: vi.fn() }),
}));
vi.mock('../../overview/useSpecificationNavigationMetadata', () => ({
  useSpecificationNavigationSource: () => ({ status: 'loading' }),
}));
vi.mock('../../../sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../sessions')>()),
  useAuthOwner: () => 'owner',
}));

const { useDemoStartSource } = await import('./useDemoStartSource');

const choice: AgentChoice = {
  providerId: 'claude',
  modelId: 'm',
  effort: 'provider-default',
  mode: 'plan',
};
const name: SessionNameChoice = { mode: 'agent', value: '' };
const completed = { kind: 'completed' } as CreateSubmitOutcome;

beforeEach(() => submit.mockReset());
afterEach(cleanup);

function setup() {
  const { result } = renderHook(() => useDemoStartSource('spec-1'));

  return result.current.start;
}

describe('useDemoStartSource.start', () => {
  it('settles (rejects) when the submit itself rejects, instead of hanging (F28)', async () => {
    submit.mockRejectedValueOnce(new Error('network down'));
    const start = setup();

    await expect(start(choice, name)).rejects.toThrow('network down');
  });

  it('can start again after a rejected submit', async () => {
    submit.mockRejectedValueOnce(new Error('network down'));
    const start = setup();
    await expect(start(choice, name)).rejects.toThrow();

    submit.mockImplementationOnce(() => {
      onSession('spec-1', 'session-2');

      return Promise.resolve(completed);
    });
    await expect(start(choice, name)).resolves.toMatchObject({ sessionId: 'session-2' });
  });

  it('rejects a second start while one runs and still resolves the first (F29)', async () => {
    let finishFirst: (outcome: CreateSubmitOutcome) => void = () => undefined;
    submit.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)));
    const start = setup();

    const first = start(choice, name);
    await expect(start(choice, name)).rejects.toThrow('already being started');
    expect(submit).toHaveBeenCalledTimes(1);

    act(() => {
      onSession('spec-1', 'session-1');
      finishFirst(completed);
    });
    await expect(first).resolves.toMatchObject({ sessionId: 'session-1' });
  });

  it('a late failure of an earlier start does not drop the resolver of a later one (F29)', async () => {
    let failFirst: (outcome: CreateSubmitOutcome) => void = () => undefined;
    submit.mockImplementationOnce(() => new Promise((resolve) => (failFirst = resolve)));
    const start = setup();
    const first = start(choice, name);
    const firstSettled = expect(first).rejects.toThrow('was not started');

    act(() => {
      failFirst({ kind: 'failed' } as unknown as CreateSubmitOutcome);
    });
    await firstSettled;

    submit.mockImplementationOnce(() => {
      onSession('spec-1', 'session-2');

      return Promise.resolve(completed);
    });
    await expect(start(choice, name)).resolves.toMatchObject({ sessionId: 'session-2' });
  });
});
