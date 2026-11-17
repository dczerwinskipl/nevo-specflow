import { describe, expect, it } from 'vitest';
import { codexClaudeCatalogue } from '../catalogue/startCatalogue.stories-support';
import type { StartProvider } from '../catalogue/startCatalogue';
import { agentAvailability, onlyRestartHelps, recheckCanHelp } from './agentAvailability';

const [codex, claude] = codexClaudeCatalogue.providers as [StartProvider, StartProvider];
const catalogue = (...providers: StartProvider[]) => ({ demo: false, providers });
const unavailable = { ...codex, available: false };
const undetermined = { ...claude, available: false, undetermined: true as const };

describe('agentAvailability', () => {
  it('says nothing while every agent can start', () => {
    expect(agentAvailability(catalogue(codex, claude))).toEqual({ kind: 'all' });
  });

  it('names the agents that cannot start while another can', () => {
    expect(agentAvailability(catalogue(unavailable, claude))).toEqual({
      kind: 'some',
      unavailable: [unavailable],
      onlyUndetermined: false,
    });
    expect(agentAvailability(catalogue(codex, undetermined))).toMatchObject({
      kind: 'some',
      onlyUndetermined: true,
    });
  });

  it('counts only confirmed unavailability as "no agent available"', () => {
    const confirmed = { ...claude, available: false };
    expect(agentAvailability(catalogue(unavailable, confirmed)).kind).toBe('none');
    expect(agentAvailability(catalogue(unavailable, undetermined)).kind).toBe('undetermined');
  });
});

describe('recheck or restart', () => {
  const withFixes = (...applies: ('recheck' | 'restart')[]): StartProvider => ({
    ...unavailable,
    diagnosis: {
      fixes: applies.map((how) => ({ applies: how, text: { key: 'common.close' } })),
    },
  });

  it('offers Check again only when a fix can be seen by it', () => {
    expect(recheckCanHelp(withFixes('recheck', 'restart'))).toBe(true);
    expect(recheckCanHelp(withFixes('restart'))).toBe(false);
    expect(onlyRestartHelps(withFixes('restart'))).toBe(true);
    expect(onlyRestartHelps(withFixes('recheck', 'restart'))).toBe(false);
  });

  it('offers neither when nothing on this machine fixes it', () => {
    expect(recheckCanHelp(withFixes())).toBe(false);
    expect(onlyRestartHelps(withFixes())).toBe(false);
  });
});
