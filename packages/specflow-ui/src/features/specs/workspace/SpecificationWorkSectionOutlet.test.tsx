import { describe, expect, it, vi } from 'vitest';
import { SectionBoundary } from './SpecificationWorkSectionOutlet';

function createFailedBoundary(onRetry: () => void | Promise<void>) {
  let retry: (() => void) | undefined;
  const instance = new SectionBoundary({
    onRetry,
    children: null,
    fallback: (onRetryAction) => {
      retry = onRetryAction;
      return 'Contribution failed';
    },
  });
  // Exercise the boundary's state machine without relying on a DOM test environment.
  // React normally schedules these updates; this mock applies them synchronously.
  vi.spyOn(instance, 'setState').mockImplementation((update) => {
    if (typeof update === 'function') {
      throw new Error('This boundary uses object state updates only');
    }
    instance.state = { ...instance.state, ...update };
  });
  instance.state = { failed: true, recovering: false };
  expect(instance.render()).toBe('Contribution failed');
  if (!retry) throw new Error('Expected retry action');
  return { instance, retry };
}

describe('Specification Work contribution failure isolation', () => {
  it('remains failed through ordinary updates until the user explicitly retries', () => {
    const onRetry = vi.fn();
    const { instance } = createFailedBoundary(onRetry);
    instance.render();
    expect(onRetry).not.toHaveBeenCalled();
    expect(instance.state.failed).toBe(true);
  });

  it('recovers after refresh succeeds', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const { instance, retry } = createFailedBoundary(onRetry);
    retry();
    expect(instance.state).toEqual({ failed: true, recovering: true });
    await vi.waitFor(() => {
      expect(instance.state).toEqual({ failed: false, recovering: false });
    });
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps the error visible when the refresh fails so the user can retry', async () => {
    const onRetry = vi.fn().mockRejectedValue(new Error('Service unavailable'));
    const { instance, retry } = createFailedBoundary(onRetry);
    retry();
    await vi.waitFor(() => {
      expect(instance.state).toEqual({ failed: true, recovering: false });
    });
    expect(instance.render()).toBe('Contribution failed');
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
