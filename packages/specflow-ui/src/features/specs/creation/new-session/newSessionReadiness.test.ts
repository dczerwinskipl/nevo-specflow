import { describe, expect, it } from 'vitest';
import { catalogue } from '../options/creationCatalogue.stories-support';
import { newSessionReadiness } from './newSessionReadiness';

const ready = {
  catalogue,
  agent: { providerId: 'codex', modelId: 'model-a', effort: 'provider-default', mode: 'agent' },
  name: { mode: 'agent', value: '' },
  configurationUnavailable: false,
} as const;

const reason = (input: Parameters<typeof newSessionReadiness>[0]) =>
  newSessionReadiness(input).prerequisite?.key;

describe('newSessionReadiness', () => {
  it('starts with an agent, a model, a supported mode and effort; the agent names it', () => {
    expect(newSessionReadiness(ready)).toEqual({ prerequisite: undefined, canStart: true });
  });

  it('says that no agent is available rather than asking to choose one', () => {
    const offline = {
      ...catalogue,
      providers: catalogue.providers.map((p) => ({ ...p, available: false })),
    };
    expect(reason({ ...ready, catalogue: offline })).toBe('sessionStart.prerequisite.noProvider');
  });

  it('asks for the model before the mode, and for the mode before the name', () => {
    const unnamed = { mode: 'custom', value: '' } as const;
    expect(reason({ ...ready, agent: { ...ready.agent, modelId: '' }, name: unnamed })).toBe(
      'create.prerequisite.model',
    );
    expect(reason({ ...ready, agent: { ...ready.agent, mode: '' }, name: unnamed })).toBe(
      'create.prerequisite.mode',
    );
  });

  it('asks for an effort the model supports', () => {
    expect(reason({ ...ready, agent: { ...ready.agent, effort: 'not-an-effort' } })).toBe(
      'create.prerequisite.model',
    );
  });

  it('has no first-message prerequisite: the message is written in the Session', () => {
    expect(reason(ready)).toBeUndefined();
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
