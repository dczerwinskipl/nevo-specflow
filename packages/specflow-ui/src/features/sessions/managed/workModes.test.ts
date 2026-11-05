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
  it("lists only the provider's usable modes, in catalogue order under their own titles", () => {
    // Build's engine mode is not one the provider offers, Ask is unavailable, Review not
    // authorized: all omitted, not shown disabled.
    expect(runtimeWorkModes(provider)).toEqual([{ id: 'plan', title: 'Plan' }]);
    expect(runtimeWorkModes(undefined)).toEqual([]);
    expect(runtimeWorkModes({ ...provider, providerModes: undefined })).toEqual([]);
  });

  it("keeps the Session's current mode listed, disabled with its reason, once it became unusable", () => {
    expect(runtimeWorkModes(provider, 'ask')).toEqual([
      { id: 'plan', title: 'Plan' },
      { id: 'ask', title: 'Ask', disabled: true, reason: 'Not installed.' },
    ]);
    expect(runtimeWorkModes(provider, 'plan')).toEqual([{ id: 'plan', title: 'Plan' }]);
  });

  it('selects a listed choice first, else a selectable default, else the first selectable mode', () => {
    const options = runtimeWorkModes(
      { ...provider, modes: ['read-only', 'workspace-write'] },
      'ask',
    );
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
