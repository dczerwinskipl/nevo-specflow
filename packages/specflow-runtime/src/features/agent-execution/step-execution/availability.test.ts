import type { AgentLaunch, AgentOption } from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import {
  chosenLaunch,
  withRuntimeReasons,
  sessionWorkMode,
  type AgentRuntimeFacts,
} from './availability';

const launch: AgentLaunch = {
  archetype: 'implementer',
  provider: 'claude',
  model: 'claude-sonnet-5-5',
  session: { mode: 'fresh' },
};
const available: AgentOption = { kind: 'available', launch };
const ready: AgentRuntimeFacts = { sessions: true, provider: { ready: true } };

describe('the agent option with the Runtime reasons', () => {
  it.each<[string, AgentRuntimeFacts, Partial<Extract<AgentOption, { kind: 'unavailable' }>>]>([
    ['the demo', { ...ready, demo: true }, { reason: 'demo' }],
    ['Sessions off', { sessions: false }, { reason: 'provider-not-ready' }],
    [
      'a provider that is not ready',
      { sessions: true, provider: { ready: false, detail: 'Not signed in.' } },
      { reason: 'provider-not-ready', detail: 'Not signed in.' },
    ],
    [
      'another writer',
      { ...ready, busy: { detail: 'The agent of Session s is working.' } },
      { reason: 'project-busy', detail: 'The agent of Session s is working.' },
    ],
    [
      'a dirty checkout',
      { ...ready, baseline: { reason: 'dirty-baseline', paths: ['src/a.ts'], count: 3 } },
      { reason: 'dirty-baseline', paths: ['src/a.ts'], count: 3 },
    ],
    [
      'files changed since the last Turn',
      {
        ...ready,
        baseline: {
          reason: 'baseline-changed',
          detail: '1 file(s) changed since the agent stopped: b.md. Undo or commit, then continue.',
          paths: ['b.md'],
          count: 1,
        },
      },
      {
        reason: 'baseline-changed',
        detail: '1 file(s) changed since the agent stopped: b.md. Undo or commit, then continue.',
        paths: ['b.md'],
      },
    ],
  ])('is unavailable for %s, keeping the launch', (_name, facts, expected) => {
    expect(withRuntimeReasons(available, facts)).toEqual(
      expect.objectContaining({ kind: 'unavailable', launch, ...expected }),
    );
  });

  it('names the first blocker an owner resolves first', () => {
    expect(
      withRuntimeReasons(available, {
        sessions: true,
        provider: { ready: false },
        busy: { detail: 'x' },
        baseline: { reason: 'dirty-baseline', paths: [], count: 1 },
      }),
    ).toMatchObject({ reason: 'provider-not-ready' });
  });

  it("keeps the definitions' own reason and an available option as they are", () => {
    const missing: AgentOption = { kind: 'unavailable', reason: 'model-missing' };
    expect(withRuntimeReasons(missing, { sessions: false })).toBe(missing);
    expect(withRuntimeReasons({ ...available, independent: true }, ready)).toEqual({
      ...available,
      independent: true,
    });
  });
});

describe('the launch an agent step execution start uses (D18)', () => {
  it('takes the owner choice only for a fresh Session', () => {
    expect(chosenLaunch(launch, {})).toBe(launch);
    expect(chosenLaunch(launch, { model: 'claude-opus-5-5' })).toMatchObject({
      provider: 'claude',
      model: 'claude-opus-5-5',
    });
    // Another provider needs its own model.
    expect(chosenLaunch(launch, { provider: 'codex' })).toMatchObject({
      provider: 'codex',
      model: '',
    });
    expect(
      chosenLaunch({ ...launch, session: { mode: 'reuse', sessionId: 's' } }, { model: 'm' }),
    ).toBe('not-for-a-continued-session');
  });
});

describe('the work mode of a continued agent Session', () => {
  const providerModes = [
    { modeId: 'auto', title: 'Auto', nativeMode: 'auto', mode: 'workspace-write' as const },
    { modeId: 'manual', title: 'Manual', nativeMode: 'default', mode: 'workspace-write' as const },
  ].map((mode) => ({ ...mode, readiness: 'ready' as const }));

  it("names the Session's own mode by the catalogue's title, never by its id alone", () => {
    expect(sessionWorkMode({ providerModes }, 'manual')).toEqual({
      providerModeId: 'manual',
      title: 'Manual',
    });
    expect(sessionWorkMode({ providerModes }, 'plan')).toBeUndefined();
    expect(sessionWorkMode({ providerModes }, undefined)).toBeUndefined();
    expect(sessionWorkMode(undefined, 'auto')).toBeUndefined();
  });
});
