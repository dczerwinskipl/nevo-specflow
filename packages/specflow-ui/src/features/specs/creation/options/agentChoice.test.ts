import { describe, expect, it } from 'vitest';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import {
  initialAgentChoice,
  modeLabel,
  selectModel,
  selectProvider,
  supportedModes,
} from './agentChoice';

const provider = {
  id: 'p1',
  available: true,
  models: [
    { id: 'm-agent', modes: ['ask', 'agent'], efforts: [] },
    { id: 'm-edit', modes: ['edit', 'ask'], efforts: ['low'] },
  ],
} as unknown as DemoCatalogue['providers'][number];

describe('agentChoice', () => {
  it('starts on the first available provider with nothing below it chosen', () => {
    const catalogue = {
      providers: [{ id: 'off', available: false }, provider],
    } as unknown as DemoCatalogue;
    expect(initialAgentChoice(catalogue)).toEqual({
      providerId: 'p1',
      modelId: '',
      effort: 'provider-default',
      mode: '',
    });
  });

  it('resets model, effort and mode when the provider changes', () => {
    const choice = { providerId: 'p1', modelId: 'm-edit', effort: 'low', mode: 'edit' };
    expect(selectProvider(choice, 'p2')).toEqual({
      providerId: 'p2',
      modelId: '',
      effort: 'provider-default',
      mode: '',
    });
  });

  it('keeps a supported mode, else prefers agent, else the first mode', () => {
    const base = { providerId: 'p1', modelId: '', effort: 'low', mode: 'ask' };
    expect(selectModel(base, provider, 'm-agent')).toMatchObject({
      mode: 'ask',
      effort: 'provider-default',
    });
    expect(selectModel({ ...base, mode: 'edit' }, provider, 'm-agent').mode).toBe('agent');
    expect(selectModel({ ...base, mode: 'agent' }, provider, 'm-edit').mode).toBe('edit');
    expect(selectModel(base, undefined, 'x').mode).toBe('');
  });

  it('orders modes canonically and labels unknown modes by their id', () => {
    expect(supportedModes(['agent', 'custom', 'ask'])).toEqual(['ask', 'agent', 'custom']);
    expect(modeLabel('edit')).toBe('Edit');
    expect(modeLabel('custom')).toBe('custom');
  });
});
