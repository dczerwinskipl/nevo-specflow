import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { createBackgroundRefresh, createRefreshSlot } from './background-refresh';

describe('the Runtime-wide refresh slot', () => {
  it('is freed by a job that throws, which only cools its own index down', async () => {
    const log = { warn: vi.fn() } as unknown as FastifyBaseLogger;
    const slot = createRefreshSlot();
    const failing = createBackgroundRefresh(slot, log);
    const other = createBackgroundRefresh(slot, log);
    let failed!: () => void;
    const ran = new Promise<void>((resolve) => {
      failed = resolve;
    });

    expect(
      failing.start(() => {
        failed();

        return Promise.reject(new Error('cannot write /private/checkout'));
      }),
    ).toEqual({ status: 'started' });
    expect(other.start(() => Promise.resolve({}))).toEqual({ status: 'waiting' });
    await ran;
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(log.warn).toHaveBeenCalledOnce();
    expect(failing.start(() => Promise.resolve({}))).toEqual({ status: 'cooling-down' });
    expect(other.start(() => Promise.resolve({}))).toEqual({ status: 'started' });
    await Promise.all([failing.stop(), other.stop()]);
  });
});
