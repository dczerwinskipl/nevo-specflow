import { describe, expect, it } from 'vitest';

import { workModeFor } from './work-mode';

describe('the work mode of a fresh agent Session', () => {
  const mode = (modeId: string, extra: object = {}) => ({
    modeId,
    title: modeId === 'auto' ? 'Auto' : 'Accept edits',
    nativeMode: modeId,
    mode: 'workspace-write' as const,
    readiness: 'ready' as const,
    ...extra,
  });

  it('runs in auto when the provider runs the model in auto, else in accept edits', () => {
    const provider = {
      providerModes: [mode('acceptEdits'), mode('auto', { modelIds: ['opus', 'sonnet'] })],
    };
    expect(workModeFor(provider, 'opus')).toEqual({ providerModeId: 'auto', title: 'Auto' });
    expect(workModeFor(provider, 'haiku')).toEqual({
      providerModeId: 'acceptEdits',
      title: 'Accept edits',
    });
  });

  it('never picks an auto mode that is not ready or not authorized', () => {
    for (const extra of [{ readiness: 'unavailable' }, { authorized: false }]) {
      expect(
        workModeFor({ providerModes: [mode('auto', extra), mode('acceptEdits')] }, 'opus'),
      ).toMatchObject({ providerModeId: 'acceptEdits' });
    }

    expect(workModeFor({}, 'opus')).toBeUndefined();
  });
});
