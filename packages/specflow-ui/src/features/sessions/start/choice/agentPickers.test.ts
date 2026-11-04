import { describe, expect, it } from 'vitest';
import type { StartProvider } from '../catalogue/startCatalogue';
import {
  applyModelEffort,
  modelEffortValue,
  modeValue,
  pickerModes,
  pickerProvider,
} from './agentPickers';

const mode = (id: string, title: string, available = true) => ({ id, title, available });
const provider: StartProvider = {
  id: 'p1',
  title: 'P1',
  icon: undefined,
  available: true,
  modes: [mode('edit', 'Edit'), mode('agent', 'Agent'), mode('ask', 'Ask')],
  defaultModeId: 'agent',
  models: [
    { id: 'm-agent', title: 'Agent model', modeIds: ['agent', 'ask', 'custom'], efforts: [] },
    { id: 'm-edit', title: 'Edit model', modeIds: ['edit', 'ask'], efforts: ['low', 'high'] },
  ],
};
const empty = { providerId: 'p1', modelId: '', effort: 'provider-default', mode: '' };
const text = (title: unknown) => String(title);

describe('agent pickers over the start catalogue', () => {
  it('lets the Composer model picker offer every catalogue model with its efforts', () => {
    expect(pickerProvider(provider)).toEqual({
      capabilities: { modelOverride: true, effortOverride: true },
      models: [
        { modelId: 'm-agent', title: 'Agent model', efforts: [] },
        { modelId: 'm-edit', title: 'Edit model', efforts: ['low', 'high'] },
      ],
    });
    expect(pickerProvider(undefined)).toBeUndefined();
  });

  it('shows the provider default as "no effort" and nothing before a model is chosen', () => {
    expect(modelEffortValue(empty)).toBeUndefined();
    expect(modelEffortValue({ ...empty, modelId: 'm-edit' })).toEqual({
      modelId: 'm-edit',
      effort: undefined,
    });
    expect(modelEffortValue({ ...empty, modelId: 'm-edit', effort: 'high' })).toEqual({
      modelId: 'm-edit',
      effort: 'high',
    });
  });

  it('a new model keeps a supported mode (else the provider default); an effort pick keeps the model', () => {
    const agent = applyModelEffort(empty, provider, 'm-agent', undefined);
    expect(agent).toEqual({ ...empty, modelId: 'm-agent', mode: 'agent' });
    const edit = applyModelEffort({ ...agent, mode: 'ask' }, provider, 'm-edit', undefined);
    expect(edit).toEqual({ ...empty, modelId: 'm-edit', mode: 'ask' });
    expect(applyModelEffort(edit, provider, 'm-edit', 'high')).toEqual({ ...edit, effort: 'high' });
    expect(applyModelEffort({ ...edit, effort: 'high' }, provider, 'm-edit', undefined)).toEqual(
      edit,
    );
  });

  it("offers the chosen model's modes under the catalogue's own titles, in catalogue order", () => {
    // `custom` is a model mode the provider does not describe: nothing to call it, so left out.
    expect(pickerModes(provider, 'm-agent', text)).toEqual([
      { id: 'agent', title: 'Agent' },
      { id: 'ask', title: 'Ask' },
    ]);
    expect(pickerModes(provider, 'm-edit', text)).toEqual([
      { id: 'edit', title: 'Edit' },
      { id: 'ask', title: 'Ask' },
    ]);
    expect(pickerModes(provider, '', text)).toEqual([]);
    expect(pickerModes(undefined, 'm-agent', text)).toEqual([]);
  });

  it('marks an unavailable mode disabled, with the catalogue reason', () => {
    const locked = {
      ...provider,
      modes: [{ ...mode('edit', 'Edit', false), reason: 'Needs approval' }, mode('ask', 'Ask')],
    };
    expect(pickerModes(locked, 'm-edit', text)).toEqual([
      { id: 'edit', title: 'Edit', disabled: true, reason: 'Needs approval' },
      { id: 'ask', title: 'Ask' },
    ]);
  });

  it('selects the opaque mode id as the session start command carries it', () => {
    expect(modeValue({ ...empty, mode: 'edit' })).toBe('edit');
    expect(modeValue(empty)).toBeUndefined();
  });
});
