import { describe, expect, it } from 'vitest';
import { createOperationLock } from './operationLock';

describe('operationLock', () => {
  it('lets an action begin only when idle', () => {
    const lock = createOperationLock();
    expect(lock.canBegin()).toBe(true);
    lock.setChecking(true);
    expect(lock.canBegin()).toBe(false);
    lock.setChecking(false);
    lock.setBusy(true);
    expect(lock.canBegin()).toBe(false);
    lock.setBusy(false);
    lock.setUnknown(true);
    expect(lock.canBegin()).toBe(false);
    lock.setUnknown(false);
    expect(lock.canBegin()).toBe(true);
  });

  it('allows selecting while checking but not while busy or unknown', () => {
    const lock = createOperationLock();
    lock.setChecking(true);
    expect(lock.canSelect()).toBe(true);
    lock.setBusy(true);
    expect(lock.canSelect()).toBe(false);
    lock.setBusy(false);
    lock.setUnknown(true);
    expect(lock.canSelect()).toBe(false);
  });

  it('exposes the live flags', () => {
    const lock = createOperationLock();
    lock.setBusy(true);
    lock.setUnknown(true);
    expect([lock.busy, lock.checking, lock.unknown]).toEqual([true, false, true]);
  });
});
