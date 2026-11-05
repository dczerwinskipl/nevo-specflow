import { describe, expect, it } from 'vitest';
import { providerDescriptor } from '../catalogue/startCatalogue.stories-support';
import { createSessionBody } from './useManagedStartSource';

const agent = { providerId: 'claude', modelId: '', effort: 'provider-default', mode: '' };
const noName = { mode: 'agent', value: '' } as const;
const native = {
  modeId: 'agent',
  title: 'Agent',
  nativeMode: 'agent',
  mode: 'workspace-write',
  readiness: 'ready',
} as const;

describe('createSessionBody', () => {
  it('sends the model, an explicit effort and the own name only when they were chosen', () => {
    const provider = providerDescriptor({ providerId: 'claude' });
    expect(createSessionBody(provider, { ...agent, mode: 'read-only' }, noName)).toEqual({
      providerId: 'claude',
      mode: 'read-only',
    });
    expect(
      createSessionBody(
        provider,
        { ...agent, modelId: 'm1', effort: 'high', mode: 'read-only' },
        { mode: 'custom', value: ' Review SSO ' },
      ),
    ).toEqual({
      providerId: 'claude',
      modelId: 'm1',
      effort: 'high',
      mode: 'read-only',
      title: 'Review SSO',
    });
  });

  it("sends a provider's own mode with its engine safety mode and its id", () => {
    const provider = providerDescriptor({
      providerId: 'claude',
      modes: ['read-only', 'workspace-write'],
      providerModes: [native],
    });
    expect(createSessionBody(provider, { ...agent, mode: 'agent' }, noName)).toEqual({
      providerId: 'claude',
      mode: 'workspace-write',
      providerModeId: 'agent',
    });
  });

  it('sends the engine safety mode as it is when the provider lists no modes of its own', () => {
    const provider = providerDescriptor({ providerId: 'claude', modes: ['workspace-write'] });
    expect(createSessionBody(provider, { ...agent, mode: 'workspace-write' }, noName).mode).toBe(
      'workspace-write',
    );
  });
});
