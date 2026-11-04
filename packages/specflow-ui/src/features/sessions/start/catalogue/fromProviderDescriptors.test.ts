import { describe, expect, it } from 'vitest';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { startCatalogueFromProviders } from './fromProviderDescriptors';
import { providerDescriptor } from './startCatalogue.stories-support';

const providerMode = (
  overrides: Partial<NonNullable<ProviderDescriptor['providerModes']>[number]> & { modeId: string },
): NonNullable<ProviderDescriptor['providerModes']>[number] => ({
  title: overrides.modeId,
  nativeMode: overrides.modeId,
  mode: 'workspace-write',
  readiness: 'ready',
  authorized: true,
  ...overrides,
});

const only = (descriptor: ProviderDescriptor) =>
  startCatalogueFromProviders([descriptor]).providers[0]!;

describe('startCatalogueFromProviders', () => {
  it('is available only while the provider is ready', () => {
    const states = (['ready', 'unavailable', 'authenticationRequired', 'unknown'] as const).map(
      (readiness) => only(providerDescriptor({ providerId: 'p', readiness })).available,
    );
    expect(states).toEqual([true, false, false, false]);
    expect(startCatalogueFromProviders([]).demo).toBe(false);
  });

  it('gives the reason of an unavailable provider, else the sign-in text for authentication', () => {
    expect(
      only(providerDescriptor({ providerId: 'p', readiness: 'unavailable', reason: ' No CLI ' }))
        .reason,
    ).toBe('No CLI');
    expect(
      only(providerDescriptor({ providerId: 'p', readiness: 'authenticationRequired' })).reason,
    ).toEqual({ key: 'managedSession.authenticationRequired' });
    expect(only(providerDescriptor({ providerId: 'p' })).reason).toBeUndefined();
  });

  it('keeps the provider modes with their availability: ready, authorized and offered', () => {
    const provider = only(
      providerDescriptor({
        providerId: 'p',
        modes: ['read-only', 'workspace-write'],
        defaultModeId: 'agent',
        providerModes: [
          providerMode({ modeId: 'agent' }),
          providerMode({ modeId: 'unready', readiness: 'unavailable', reason: 'Not installed' }),
          providerMode({ modeId: 'denied', authorized: false }),
          providerMode({ modeId: 'plan', mode: 'read-only' }),
        ],
      }),
    );
    expect(provider.modes).toEqual([
      { id: 'agent', title: 'agent', available: true },
      { id: 'unready', title: 'unready', available: false, reason: 'Not installed' },
      { id: 'denied', title: 'denied', available: false },
      { id: 'plan', title: 'plan', available: true },
    ]);
    expect(provider.defaultModeId).toBe('agent');
  });

  it('marks a mode unavailable when its safety mode is not one the provider currently offers', () => {
    const provider = only(
      providerDescriptor({
        providerId: 'p',
        modes: ['read-only'],
        providerModes: [providerMode({ modeId: 'agent' })],
      }),
    );
    expect(provider.modes[0]?.available).toBe(false);
  });

  it('falls back to the safety modes under generic names when no provider modes are listed', () => {
    const provider = only(
      providerDescriptor({ providerId: 'p', modes: ['read-only', 'workspace-write'] }),
    );
    expect(provider.modes).toEqual([
      { id: 'read-only', title: { key: 'sessionStart.modes.readOnly' }, available: true },
      {
        id: 'workspace-write',
        title: { key: 'sessionStart.modes.workspaceWrite' },
        available: true,
      },
    ]);
  });

  it('offers every mode to every model, with the efforts of the model', () => {
    const provider = only(
      providerDescriptor({
        providerId: 'p',
        models: [
          { modelId: 'm1', title: 'M1', efforts: ['low', 'high'] },
          { modelId: 'm2', title: 'M2', efforts: [] },
        ],
        modes: ['read-only'],
      }),
    );
    expect(provider.models).toEqual([
      { id: 'm1', title: 'M1', efforts: ['low', 'high'], modeIds: ['read-only'] },
      { id: 'm2', title: 'M2', efforts: [], modeIds: ['read-only'] },
    ]);
  });

  it('offers no model choice (nor efforts) where the provider does not accept an override', () => {
    const models = [{ modelId: 'm1', title: 'M1', efforts: ['low'] }];
    const base = providerDescriptor({ providerId: 'p', models });
    expect(
      only({ ...base, capabilities: { ...base.capabilities, modelOverride: false } }).models,
    ).toEqual([]);
    expect(
      only({ ...base, capabilities: { ...base.capabilities, effortOverride: false } }).models[0]
        ?.efforts,
    ).toEqual([]);
  });

  describe('available means startable', () => {
    it('is unavailable when it is ready but none of its own modes can run, with the first mode reason', () => {
      const provider = only(
        providerDescriptor({
          providerId: 'p',
          modes: ['read-only', 'workspace-write'],
          providerModes: [
            providerMode({ modeId: 'a', readiness: 'unavailable', reason: 'Not installed' }),
            providerMode({ modeId: 'b', authorized: false, reason: 'Denied' }),
          ],
        }),
      );
      expect(provider.available).toBe(false);
      expect(provider.reason).toBe('Not installed');
    });

    it('says that no work mode is available when the modes give no reason', () => {
      const provider = only(
        providerDescriptor({
          providerId: 'p',
          modes: ['read-only', 'workspace-write'],
          providerModes: [providerMode({ modeId: 'a', authorized: false })],
        }),
      );
      expect(provider.available).toBe(false);
      expect(provider.reason).toEqual({ key: 'sessionStart.provider.noMode' });
    });

    it('needs the read-only mode when it lists no modes of its own', () => {
      expect(only(providerDescriptor({ providerId: 'p', modes: [] })).available).toBe(false);
      expect(
        only(providerDescriptor({ providerId: 'p', modes: ['workspace-write'] })).available,
      ).toBe(false);
      expect(only(providerDescriptor({ providerId: 'p', modes: ['read-only'] })).available).toBe(
        true,
      );
    });

    it('is startable with a single executable mode among unavailable ones', () => {
      const provider = only(
        providerDescriptor({
          providerId: 'p',
          modes: ['read-only', 'workspace-write'],
          providerModes: [
            providerMode({ modeId: 'a', readiness: 'unavailable' }),
            providerMode({ modeId: 'plan', mode: 'read-only' }),
          ],
        }),
      );
      expect(provider.available).toBe(true);
    });

    it('keeps the reason of a provider that is not ready, whatever its modes', () => {
      const provider = only(
        providerDescriptor({
          providerId: 'p',
          readiness: 'unavailable',
          reason: 'No CLI',
          modes: [],
        }),
      );
      expect(provider.available).toBe(false);
      expect(provider.reason).toBe('No CLI');
    });
  });

  it('keeps the mock provider caveat as the note of an available provider', () => {
    expect(only(providerDescriptor({ providerId: 'mock' })).reason).toEqual({
      key: 'managedSession.mockNote',
    });
  });
});
