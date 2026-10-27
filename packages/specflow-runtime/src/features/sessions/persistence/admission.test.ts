import { afterEach, expect, it, vi } from 'vitest';
import { createStoreAdmission } from './admission';

afterEach(() => vi.useRealTimers());

it('reserves lifecycle capacity under read pressure and drains waiting facts in order', async () => {
  const admission = createStoreAdmission();
  const reads = await Promise.all(Array.from({ length: 48 }, () => admission.acquire(false)));
  await expect(admission.acquire(false)).rejects.toMatchObject({ code: 'SESSION_STORE_BUSY' });
  const facts = await Promise.all(Array.from({ length: 16 }, () => admission.acquire(true)));
  const order: number[] = [];
  const first = admission.acquire(true).then((release) => {
    order.push(1);
    return release;
  });
  const second = admission.acquire(true).then((release) => {
    order.push(2);
    return release;
  });
  reads.pop()!();
  const releaseFirst = await first;
  expect(order).toEqual([1]);
  releaseFirst();
  const releaseSecond = await second;
  expect(order).toEqual([1, 2]);
  releaseSecond();
  for (const release of [...reads, ...facts]) release();
});

it('bounds lifecycle waiting, expires it explicitly, and rejects waiters on Worker loss', async () => {
  vi.useFakeTimers();
  const admission = createStoreAdmission();
  const held = await Promise.all(Array.from({ length: 64 }, () => admission.acquire(true)));
  const waiting = Array.from({ length: 64 }, () => admission.acquire(true));
  const settled = Promise.allSettled(waiting);
  await expect(admission.acquire(true)).rejects.toMatchObject({ code: 'SESSION_STORE_BUSY' });
  await vi.advanceTimersByTimeAsync(5000);
  expect((await settled).every((result) => result.status === 'rejected')).toBe(true);
  const afterTimeout = admission.acquire(true);
  const rejected = expect(afterTimeout).rejects.toThrow('Worker stopped');
  admission.fail(new Error('Worker stopped'));
  await rejected;
  for (const release of held) release();
  await expect(admission.acquire(true)).rejects.toThrow('Worker stopped');
});
