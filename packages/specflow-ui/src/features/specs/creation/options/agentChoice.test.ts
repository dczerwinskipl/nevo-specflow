import { describe, expect, it } from 'vitest';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { initialAgentChoice, selectModel, selectProvider, supportedModes } from './agentChoice';

const provider = {
  id: 'p1',
  available: true,
  modes: [
    { id: 'edit', title: 'Edit' },
    { id: 'agent', title: 'Agent' },
    { id: 'ask', title: 'Ask' },
  ],
  defaultModeId: 'agent',
  models: [
    { id: 'm-agent', modes: ['ask', 'agent', 'undescribed'], efforts: [] },
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

  it("keeps a supported mode, else the provider's default, else the model's first mode", () => {
    const base = { providerId: 'p1', modelId: '', effort: 'low', mode: 'ask' };
    expect(selectModel(base, provider, 'm-agent')).toMatchObject({
      mode: 'ask',
      effort: 'provider-default',
    });
    expect(selectModel({ ...base, mode: 'edit' }, provider, 'm-agent').mode).toBe('agent');
    expect(selectModel({ ...base, mode: 'agent' }, provider, 'm-edit').mode).toBe('edit');
    expect(selectModel(base, undefined, 'x').mode).toBe('');
  });

  it("lists the model's modes in the provider catalogue order, leaving undescribed ids out", () => {
    expect(supportedModes(provider, provider.models[0])).toEqual([
      { id: 'agent', title: 'Agent' },
      { id: 'ask', title: 'Ask' },
    ]);
    expect(supportedModes(provider, undefined)).toEqual([]);
  });
});
