import { describe, expect, it } from 'vitest';
import { catalogue } from '../options/creationCatalogue.stories-support';
import { newSessionReadiness } from './newSessionReadiness';

const ready = {
  catalogue,
  agent: { providerId: 'codex', modelId: 'model-a', effort: 'provider-default', mode: 'agent' },
  message: 'Przejrzyj kryteria akceptacji.',
  name: { mode: 'agent', value: '' },
  configurationUnavailable: false,
} as const;

const reason = (input: Parameters<typeof newSessionReadiness>[0]) =>
  newSessionReadiness(input).prerequisite?.key;

describe('newSessionReadiness', () => {
  it('starts with an agent, a model, a supported mode and a first message; the agent names it', () => {
    expect(newSessionReadiness(ready)).toEqual({ prerequisite: undefined, canStart: true });
  });

  it('says that no agent is available rather than asking to choose one', () => {
    const offline = {
      ...catalogue,
      providers: catalogue.providers.map((p) => ({ ...p, available: false })),
    };
    expect(reason({ ...ready, catalogue: offline })).toBe('sessionStart.prerequisite.noProvider');
  });

  it('asks for the model before the mode, and for the mode before the message', () => {
    expect(reason({ ...ready, agent: { ...ready.agent, modelId: '' }, message: '' })).toBe(
      'create.prerequisite.model',
    );
    expect(reason({ ...ready, agent: { ...ready.agent, mode: '' }, message: '' })).toBe(
      'create.prerequisite.mode',
    );
  });

  it('requires a first message that is not only whitespace', () => {
    expect(reason({ ...ready, message: '  \n ' })).toBe('sessionStart.prerequisite.message');
  });

  it('requires the custom name only while the custom name is chosen', () => {
    expect(reason({ ...ready, name: { mode: 'custom', value: '  ' } })).toBe(
      'sessionStart.prerequisite.name',
    );
    expect(reason({ ...ready, name: { mode: 'agent', value: '  ' } })).toBeUndefined();
    expect(reason({ ...ready, name: { mode: 'custom', value: 'Review SSO' } })).toBeUndefined();
  });

  it('blocks on a configuration that must be refreshed first', () => {
    expect(reason({ ...ready, configurationUnavailable: true })).toBe(
      'create.prerequisite.refreshConfiguration',
    );
  });
});
