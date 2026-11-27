import { describe, expect, it } from 'vitest';
import { agentDisplayName } from './agentDisplayName';

describe('agentDisplayName', () => {
  it('names the tool and the model, then the effort when the choice has one', () => {
    const agent = { provider: 'claude', providerTitle: 'Claude Code', modelTitle: 'Opus 5.5' };
    expect(agentDisplayName(agent)).toBe('Claude Code · Opus 5.5');
    expect(agentDisplayName({ ...agent, effort: 'high' })).toBe('Claude Code · Opus 5.5 · high');
  });

  it('never shows an effort without its model (the provider default runs)', () => {
    expect(agentDisplayName({ provider: 'claude', effort: 'high' })).toBe('Claude');
  });
});
