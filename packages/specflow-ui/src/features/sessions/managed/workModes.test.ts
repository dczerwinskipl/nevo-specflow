import { describe, expect, it } from 'vitest';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { runtimeWorkModeCommand, runtimeWorkModes, selectedWorkModeId } from './workModes';

const provider = {
  providerId: 'p',
  modes: ['read-only'],
  defaultModeId: 'build',
  providerModes: [
    { modeId: 'plan', title: 'Plan', nativeMode: 'plan', mode: 'read-only', readiness: 'ready' },
    {
      modeId: 'build',
      title: 'Build',
      nativeMode: 'build',
      mode: 'workspace-write',
      readiness: 'ready',
    },
    {
      modeId: 'ask',
      title: 'Ask',
      nativeMode: 'ask',
      mode: 'read-only',
      readiness: 'unavailable',
      reason: 'Not installed.',
    },
    {
      modeId: 'review',
      title: 'Review',
      nativeMode: 'review',
      mode: 'read-only',
      readiness: 'ready',
      authorized: false,
    },
  ],
} as unknown as ProviderDescriptor;

describe('Runtime work modes', () => {
  it("lists the provider's modes in catalogue order under their own titles", () => {
    expect(runtimeWorkModes(provider)).toEqual([
      { id: 'plan', title: 'Plan' },
      // Its engine mode is not one the provider currently offers.
      { id: 'build', title: 'Build', disabled: true },
      { id: 'ask', title: 'Ask', disabled: true, reason: 'Not installed.' },
      { id: 'review', title: 'Review', disabled: true },
    ]);
    expect(runtimeWorkModes(undefined)).toEqual([]);
    expect(runtimeWorkModes({ ...provider, providerModes: undefined })).toEqual([]);
  });

  it('selects a listed choice first, else a selectable default, else the first selectable mode', () => {
    const options = runtimeWorkModes({ ...provider, modes: ['read-only', 'workspace-write'] });
    expect(selectedWorkModeId(options, [undefined, 'plan'], 'build')).toBe('plan');
    expect(selectedWorkModeId(options, ['build', 'plan'], 'build')).toBe('build');
    // A Session's current mode stays shown even when the catalogue now marks it unavailable.
    expect(selectedWorkModeId(options, [undefined, 'ask'], 'build')).toBe('ask');
    expect(selectedWorkModeId(options, ['gone', undefined], 'build')).toBe('build');
    expect(selectedWorkModeId(options, [], 'ask')).toBe('plan');
    expect(selectedWorkModeId(runtimeWorkModes(provider), [], 'build')).toBe('plan');
    expect(selectedWorkModeId([], [undefined], undefined)).toBeUndefined();
  });

  it("maps a pick onto the StartTurn command: the mode's engine mode plus its provider mode id", () => {
    expect(runtimeWorkModeCommand(provider, 'build')).toEqual({
      mode: 'workspace-write',
      providerModeId: 'build',
    });
    expect(runtimeWorkModeCommand(provider, 'plan')).toEqual({
      mode: 'read-only',
      providerModeId: 'plan',
    });
    expect(runtimeWorkModeCommand(provider, 'missing')).toBeUndefined();
    expect(runtimeWorkModeCommand(undefined, 'plan')).toBeUndefined();
  });
});
