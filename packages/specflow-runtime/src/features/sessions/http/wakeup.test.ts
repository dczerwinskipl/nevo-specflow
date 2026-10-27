import { afterEach, expect, it, vi } from 'vitest';
import { createStreamWakeup } from './wakeup';

afterEach(() => vi.useRealTimers());
it('does not miss commits between reading an outbox and entering its wait', async () => {
  let committed!: () => void;
  const unsubscribe = vi.fn();
  const wakeup = createStreamWakeup((listener) => {
    committed = listener;
    return unsubscribe;
  });
  const observed = wakeup.revision();
  committed();
  await wakeup.wait(observed, new AbortController().signal, 10000);
  expect(wakeup.revision()).toBe(observed + 1);
  const controller = new AbortController();
  const waiting = wakeup.wait(wakeup.revision(), controller.signal, 10000);
  controller.abort();
  await waiting;
  wakeup.close();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it('wakes periodically for policy refresh without fabricating an outbox change', async () => {
  vi.useFakeTimers();
  const wakeup = createStreamWakeup(() => () => undefined);
  const observed = wakeup.revision();
  const waiting = wakeup.wait(observed, new AbortController().signal, 1000);
  await vi.advanceTimersByTimeAsync(1000);
  await waiting;
  expect(wakeup.revision()).toBe(observed);
  wakeup.close();
});
