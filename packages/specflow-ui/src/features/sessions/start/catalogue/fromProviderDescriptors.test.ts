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

  it('gives the Runtime reason of an unavailable provider as the detail of what to do, else the sign-in text', () => {
    expect(
      only(providerDescriptor({ providerId: 'p', readiness: 'unavailable', reason: ' No CLI ' }))
        .hint,
    ).toMatchObject({ values: { detail: 'No CLI' } });
    expect(
      only(providerDescriptor({ providerId: 'p', readiness: 'authenticationRequired' })).reason,
    ).toEqual({ key: 'managedSession.authenticationRequired' });
    expect(only(providerDescriptor({ providerId: 'p' })).reason).toBeUndefined();
  });

  it('marks a provider that cannot work in the Specification worktree with a short reason', () => {
    const provider = only(
      providerDescriptor({
        providerId: 'codex',
        readiness: 'unavailable',
        reasonCode: 'SPECIFICATION_WORKTREE_UNSUPPORTED',
        reason: "This provider runs only in the Runtime's own checkout.",
      }),
    );
    expect(provider).toMatchObject({
      available: false,
      reason: { key: 'sessionStart.provider.worktreeUnsupported' },
      unavailableInWorktree: true,
    });
    expect(provider.hint).toBeUndefined();
  });

  it.each([
    ['NOT_ALLOWED_BY_PROJECT', 'notAllowed'],
    ['NOT_ENABLED_ON_WORKSTATION', 'notEnabled'],
  ] as const)(
    'explains a provider withheld by configuration (%s) and what to change',
    (code, key) => {
      const provider = only(
        providerDescriptor({
          providerId: 'codex',
          readiness: 'unavailable',
          reasonCode: code,
          reason: 'Runtime text',
        }),
      );
      expect(provider).toMatchObject({
        available: false,
        reason: { key: `sessionStart.provider.${key}` },
        hint: {
          key: `sessionStart.provider.${key}Help`,
          values: { key: 'sessions.providers.codex' },
        },
      });
    },
  );

  it('says a withheld provider is a configuration matter, not a worktree one', () => {
    // A withheld provider runs no driver, so the Runtime never reads it for the worktree: its
    // configuration reason stands and the worktree note does not count it.
    const provider = only(
      providerDescriptor({
        providerId: 'codex',
        readiness: 'unavailable',
        reasonCode: 'NOT_ENABLED_ON_WORKSTATION',
      }),
    );
    expect(provider.unavailableInWorktree).toBeUndefined();
    expect(provider.reason).toEqual({ key: 'sessionStart.provider.notEnabled' });
  });

  it('lists where it looked for a CLI it did not find, and what to set', () => {
    const provider = only(
      providerDescriptor({
        providerId: 'codex',
        readiness: 'unavailable',
        reasonCode: 'EXECUTABLE_NOT_FOUND',
        reason: 'No Codex CLI was found.',
        checkedLocations: [
          { source: 'path', path: 'codex.exe, codex.cmd, codex.bat' },
          {
            source: 'discovered',
            path: 'C:\\Users\\dev\\AppData\\Local\\OpenAI\\Codex\\bin\\*\\codex.exe',
            location: 'Codex desktop app',
          },
        ],
      }),
    );
    expect(provider).toMatchObject({
      reason: { key: 'sessionStart.provider.notFound' },
      hint: {
        key: 'sessionStart.provider.notFoundHelp',
        values: {
          key: 'sessions.providers.codex',
          checked:
            'PATH (codex.exe, codex.cmd, codex.bat); C:\\Users\\dev\\AppData\\Local\\OpenAI\\Codex\\bin\\*\\codex.exe',
        },
      },
    });

    const configured = only(
      providerDescriptor({
        providerId: 'codex',
        readiness: 'unavailable',
        reasonCode: 'EXECUTABLE_NOT_FOUND',
        checkedLocations: [{ source: 'configured', path: 'E:\\codex.exe' }],
      }),
    );
    expect(configured.hint).toEqual({
      key: 'sessionStart.provider.notFoundConfiguredHelp',
      values: { key: 'sessions.providers.codex', path: 'E:\\codex.exe' },
    });
  });

  it.each([
    ['EXECUTABLE_NOT_WORKING', 'notWorking'],
    ['VERSION_UNSUPPORTED', 'versionUnsupported'],
    ['INSTALLATION_UNAVAILABLE', 'setupUnsupported'],
    ['PROTOCOL_UNSUPPORTED', 'protocolUnsupported'],
    ['KNOWN_INCOMPATIBILITY', 'knownIncompatible'],
    ['RESTRICTION_UNSUPPORTED', 'restrictionUnsupported'],
    ['PROCESS_SETTLEMENT_UNVERIFIED', 'settlementUnverified'],
    ['PROBE_FAILED', 'probeFailed'],
  ] as const)('says what %s means and what to do, with the Runtime detail', (code, key) => {
    const provider = only(
      providerDescriptor({
        providerId: 'claude',
        readiness: 'unavailable',
        reasonCode: code,
        reason: ' Runtime detail. ',
      }),
    );
    expect(provider).toMatchObject({
      reason: { key: `sessionStart.provider.${key}` },
      hint: {
        key: `sessionStart.provider.${key}Help`,
        values: { key: 'sessions.providers.claude', detail: 'Runtime detail.' },
      },
    });
  });

  it('falls back to the generic not-ready text when the Runtime gives no reason', () => {
    expect(
      only(providerDescriptor({ providerId: 'claude', readiness: 'unavailable' })),
    ).toMatchObject({
      reason: { key: 'sessionStart.provider.notReady' },
      hint: { key: 'sessionStart.provider.notReadyHelp' },
    });
  });

  it('gives the provider sign-in command when sign-in is required', () => {
    expect(
      only(
        providerDescriptor({
          providerId: 'codex',
          readiness: 'authenticationRequired',
          signInCommand: 'codex login',
        }),
      ).hint,
    ).toEqual({ key: 'sessionStart.provider.signInHelp', values: { command: 'codex login' } });
  });

  it('shows how the executable was found unless the reason already names it', () => {
    const path = 'C:\\Users\\dev\\AppData\\Local\\OpenAI\\Codex\\bin\\5449\\codex.exe';
    const executable = {
      path,
      source: 'discovered' as const,
      location: 'Codex desktop app',
      version: '0.167.0',
    };
    expect(only(providerDescriptor({ providerId: 'codex', executable })).executable).toEqual({
      key: 'sessionStart.provider.executable.discovered',
      values: { path, location: 'Codex desktop app' },
    });
    expect(
      only(
        providerDescriptor({
          providerId: 'codex',
          executable: { path: 'C:\\tools\\codex.exe', source: 'path' },
        }),
      ).executable,
    ).toEqual({
      key: 'sessionStart.provider.executable.path',
      values: { path: 'C:\\tools\\codex.exe' },
    });
    expect(
      only(
        providerDescriptor({
          providerId: 'codex',
          readiness: 'unavailable',
          reasonCode: 'EXECUTABLE_NOT_WORKING',
          reason: `Codex at ${path} did not answer.`,
          executable,
        }),
      ).executable,
    ).toBeUndefined();
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
      expect(provider.reason).toEqual({ key: 'sessionStart.provider.probeFailed' });
    });
  });

  it('keeps the mock provider caveat as the note of an available provider', () => {
    expect(only(providerDescriptor({ providerId: 'mock' })).reason).toEqual({
      key: 'managedSession.mockNote',
    });
  });
});
