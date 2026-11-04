import { describe, expect, it } from 'vitest';
import type { StartCatalogue, StartProvider } from '../catalogue/startCatalogue';
import {
  initialAgentChoice,
  listedModes,
  offersModelChoice,
  selectableModes,
  selectModel,
  selectProvider,
} from './agentChoice';

const mode = (id: string, title: string, available = true) => ({ id, title, available });
const provider: StartProvider = {
  id: 'p1',
  title: 'P1',
  icon: undefined,
  available: true,
  modes: [mode('edit', 'Edit'), mode('agent', 'Agent'), mode('ask', 'Ask')],
  defaultModeId: 'agent',
  models: [
    { id: 'm-agent', title: 'M agent', modeIds: ['ask', 'agent', 'undescribed'], efforts: [] },
    { id: 'm-edit', title: 'M edit', modeIds: ['edit', 'ask'], efforts: ['low'] },
  ],
};
const emptyChoice = { providerId: '', modelId: '', effort: 'provider-default', mode: '' };

describe('agentChoice', () => {
  it('starts on the first available provider with nothing below it chosen', () => {
    const catalogue: StartCatalogue = {
      demo: true,
      providers: [{ ...provider, id: 'off', available: false }, provider],
    };
    expect(initialAgentChoice(catalogue)).toEqual({
      providerId: 'p1',
      modelId: '',
      effort: 'provider-default',
      mode: '',
    });
  });

  it('resets model, effort and mode when the provider changes', () => {
    const choice = { providerId: 'p1', modelId: 'm-edit', effort: 'low', mode: 'edit' };
    expect(selectProvider(choice, { ...provider, id: 'p2' })).toEqual({
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

  it('never picks an unavailable mode: the default is skipped for the first available one', () => {
    const locked = {
      ...provider,
      modes: [mode('edit', 'Edit'), mode('agent', 'Agent', false), mode('ask', 'Ask')],
    };
    const base = { providerId: 'p1', modelId: '', effort: 'provider-default', mode: 'agent' };
    expect(selectModel(base, locked, 'm-agent').mode).toBe('ask');
    expect(selectModel({ ...base, mode: 'ask' }, locked, 'm-edit').mode).toBe('ask');
  });

  it("lists the model's modes in the provider catalogue order, leaving undescribed ids out", () => {
    expect(listedModes(provider, provider.models[0]).map((m) => m.id)).toEqual(['agent', 'ask']);
  });

  it('shows the whole provider list before a model decides it, but offers none to choose', () => {
    expect(listedModes(provider, undefined).map((m) => m.id)).toEqual(['edit', 'agent', 'ask']);
    expect(selectableModes(provider, undefined)).toEqual([]);
    expect(listedModes(undefined, undefined)).toEqual([]);
  });

  it('lists an unavailable mode but does not offer it', () => {
    const locked = { ...provider, modes: [mode('edit', 'Edit', false), mode('ask', 'Ask')] };
    const model = locked.models[1];
    expect(listedModes(locked, model).map((m) => m.id)).toEqual(['edit', 'ask']);
    expect(selectableModes(locked, model).map((m) => m.id)).toEqual(['ask']);
  });

  describe('a provider that offers no model choice', () => {
    const plain: StartProvider = { ...provider, models: [] };

    it('has its default mode decided as soon as it is chosen', () => {
      expect(offersModelChoice(plain)).toBe(false);
      expect(selectProvider(emptyChoice, plain)).toEqual({
        providerId: 'p1',
        modelId: '',
        effort: 'provider-default',
        mode: 'agent',
      });
      expect(initialAgentChoice({ demo: false, providers: [plain] }).mode).toBe('agent');
    });

    it('offers every available mode without a model', () => {
      expect(selectableModes(plain, undefined).map((m) => m.id)).toEqual(['edit', 'agent', 'ask']);
    });
  });
});
