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
    expect(only(providerDescriptor({ providerId: 'p' }))).toMatchObject({
      status: { key: 'create.provider.available' },
    });
    expect(only(providerDescriptor({ providerId: 'p' })).diagnosis).toBeUndefined();
  });

  it.each([
    ['EXECUTABLE_NOT_FOUND', 'notFound'],
    ['EXECUTABLE_NOT_WORKING', 'failsToStart'],
    ['INSTALLATION_UNAVAILABLE', 'setup'],
    ['AUTHENTICATION_REQUIRED', 'signIn'],
    ['PROTOCOL_UNSUPPORTED', 'incompatible'],
    ['RESTRICTION_UNSUPPORTED', 'incompatible'],
    ['KNOWN_INCOMPATIBILITY', 'incompatible'],
    ['PROBE_FAILED', 'checkFailed'],
    ['PROCESS_SETTLEMENT_UNVERIFIED', 'checkUnfinished'],
    ['SPECIFICATION_WORKTREE_UNSUPPORTED', 'worktree'],
    ['NOT_ALLOWED_BY_PROJECT', 'turnedOff'],
    ['NOT_ENABLED_ON_WORKSTATION', 'turnedOff'],
  ] as const)('gives %s the short status %s', (reasonCode, status) => {
    expect(
      only(providerDescriptor({ providerId: 'p', readiness: 'unavailable', reasonCode })).status,
    ).toEqual({ key: `sessionStart.provider.status.${status}` });
  });

  it('tells a check without a result from a confirmed unavailability', () => {
    const undetermined = (overrides: Partial<ProviderDescriptor>) =>
      only(providerDescriptor({ providerId: 'p', readiness: 'unavailable', ...overrides }))
        .undetermined;
    expect(undetermined({ reasonCode: 'PROCESS_SETTLEMENT_UNVERIFIED' })).toBe(true);
    expect(undetermined({ reasonCode: 'PROBE_FAILED' })).toBe(true);
    expect(undetermined({ readiness: 'unknown' })).toBe(true);
    expect(undetermined({ reasonCode: 'EXECUTABLE_NOT_FOUND' })).toBeUndefined();
    expect(undetermined({ reasonCode: 'NOT_ENABLED_ON_WORKSTATION' })).toBeUndefined();
    expect(undetermined({ readiness: 'authenticationRequired' })).toBeUndefined();
  });

  it('fixes a configuration policy only with a restart, naming the setting and its file', () => {
    for (const [reasonCode, found, fix] of [
      ['NOT_ALLOWED_BY_PROJECT', 'notAllowed', 'notAllowedFix'],
      ['NOT_ENABLED_ON_WORKSTATION', 'notEnabled', 'notEnabledFix'],
    ] as const) {
      const provider = only(
        providerDescriptor({
          providerId: 'codex',
          title: 'Codex',
          readiness: 'unavailable',
          reasonCode,
        }),
      );
      expect(provider.diagnosis).toEqual({
        found: {
          key: `sessionStart.diagnosis.${found}`,
          values: { provider: 'Codex', key: 'sessions.providers.codex' },
        },
        fixes: [{ applies: 'restart', text: { key: `sessionStart.diagnosis.${fix}` } }],
      });
    }
  });

  it('offers installing (seen by a recheck) or pointing to a file (a restart) for a CLI not found', () => {
    const app = 'C:\\Users\\dev\\AppData\\Local\\OpenAI\\Codex\\bin\\*\\codex.exe';
    const provider = only(
      providerDescriptor({
        providerId: 'codex',
        title: 'Codex',
        readiness: 'unavailable',
        reasonCode: 'EXECUTABLE_NOT_FOUND',
        reason: 'No Codex CLI was found.',
        checkedLocations: [
          { source: 'path', path: 'codex.exe, codex.cmd, codex.bat' },
          { source: 'discovered', path: app, location: 'codex-desktop-app' },
          { source: 'discovered', path: 'E:\\npm\\a\\codex.exe', location: 'npm-global-package' },
          { source: 'discovered', path: 'E:\\npm\\b\\codex.exe', location: 'npm-global-package' },
        ],
      }),
    );
    expect(provider.diagnosis).toEqual({
      found: {
        key: 'sessionStart.diagnosis.notFound',
        values: {
          sources: [
            { key: 'sessionStart.provider.location.path' },
            { key: 'sessionStart.provider.location.codex-desktop-app' },
            { key: 'sessionStart.provider.location.npm-global-package' },
          ],
        },
      },
      checkedPaths: [
        'PATH: codex.exe, codex.cmd, codex.bat',
        app,
        'E:\\npm\\a\\codex.exe',
        'E:\\npm\\b\\codex.exe',
      ],
      fixes: [
        {
          applies: 'recheck',
          title: { key: 'sessionStart.diagnosis.installTitle' },
          text: { key: 'sessionStart.diagnosis.installText', values: { provider: 'Codex' } },
        },
        {
          applies: 'restart',
          title: { key: 'sessionStart.diagnosis.pointTitle' },
          text: { key: 'sessionStart.diagnosis.pointText' },
          code: {
            file: '.nevo/local/config.yaml',
            body: 'sessions:\n  providers:\n    codex:\n      executable: C:\\path\\to\\codex.exe',
          },
        },
      ],
    });
  });

  it('writes the placeholder path in the style of the machine', () => {
    const provider = only(
      providerDescriptor({
        providerId: 'codex',
        readiness: 'unavailable',
        reasonCode: 'EXECUTABLE_NOT_FOUND',
        checkedLocations: [
          { source: 'path', path: 'codex' },
          { source: 'discovered', path: '/opt/codex/bin/codex', location: 'npm-global-package' },
        ],
      }),
    );
    expect(provider.diagnosis?.fixes[1]?.code?.body).toContain('executable: /path/to/codex');
  });

  it('reinstalls an npm package without its executable, and corrects a configured path', () => {
    const launcher = only(
      providerDescriptor({
        providerId: 'codex',
        readiness: 'unavailable',
        reasonCode: 'EXECUTABLE_NOT_FOUND',
        checkedLocations: [{ source: 'path', path: 'codex.exe, codex.cmd, codex.bat' }],
        unresolvedLauncher: { path: 'E:\\npm\\codex.cmd', package: '@openai/codex' },
      }),
    );
    expect(launcher.status).toEqual({ key: 'sessionStart.provider.status.setup' });
    expect(launcher.diagnosis).toMatchObject({
      found: { key: 'sessionStart.diagnosis.launcherBroken', values: { package: '@openai/codex' } },
      checkedPaths: ['E:\\npm\\codex.cmd', 'PATH: codex.exe, codex.cmd, codex.bat'],
      fixes: [
        { applies: 'recheck', code: { body: 'npm install -g @openai/codex' } },
        { applies: 'restart' },
      ],
    });

    const configured = only(
      providerDescriptor({
        providerId: 'codex',
        readiness: 'unavailable',
        reasonCode: 'EXECUTABLE_NOT_FOUND',
        checkedLocations: [{ source: 'configured', path: 'E:\\codex.exe' }],
      }),
    );
    expect(configured.diagnosis).toEqual({
      found: {
        key: 'sessionStart.diagnosis.notFoundConfigured',
        values: { path: 'E:\\codex.exe' },
      },
      fixes: [
        {
          applies: 'restart',
          text: {
            key: 'sessionStart.diagnosis.notFoundConfiguredFix',
            values: { key: 'sessions.providers.codex' },
          },
        },
      ],
    });
  });

  it('gives the sign-in command as a command to run, then a recheck', () => {
    expect(
      only(
        providerDescriptor({
          providerId: 'codex',
          title: 'Codex',
          readiness: 'authenticationRequired',
          signInCommand: 'codex login',
        }),
      ).diagnosis,
    ).toEqual({
      fixes: [
        {
          applies: 'recheck',
          text: { key: 'sessionStart.diagnosis.signIn', values: { provider: 'Codex' } },
          code: { body: 'codex login' },
        },
      ],
    });
  });

  it('keeps the Runtime detail and the detected version of an incompatible build', () => {
    const provider = only(
      providerDescriptor({
        providerId: 'claude',
        title: 'Claude',
        readiness: 'unavailable',
        reasonCode: 'KNOWN_INCOMPATIBILITY',
        reason: ' Claude Code 3.4.0 is recorded as incompatible. ',
        executable: { path: '/usr/bin/claude', source: 'path', version: '3.4.0' },
      }),
    );
    expect(provider.diagnosis).toEqual({
      detail: 'Claude Code 3.4.0 is recorded as incompatible.',
      executable: {
        key: 'sessionStart.provider.executable.path',
        values: { path: '/usr/bin/claude' },
      },
      found: {
        key: 'sessionStart.diagnosis.knownIncompatibleVersion',
        values: { version: '3.4.0' },
      },
      fixes: [
        {
          applies: 'recheck',
          text: { key: 'sessionStart.diagnosis.supportedVersion', values: { provider: 'Claude' } },
        },
      ],
    });
  });

  it('shows the executable only when the reason concerns it and does not already name it', () => {
    const path = 'C:\\Users\\dev\\AppData\\Local\\OpenAI\\Codex\\bin\\5449\\codex.exe';
    const executable = {
      path,
      source: 'discovered' as const,
      location: 'codex-desktop-app' as const,
    };
    const diagnosis = (overrides: Partial<ProviderDescriptor>) =>
      only(
        providerDescriptor({
          providerId: 'codex',
          readiness: 'unavailable',
          executable,
          ...overrides,
        }),
      ).diagnosis;
    expect(diagnosis({ reasonCode: 'EXECUTABLE_NOT_WORKING' })?.executable).toEqual({
      key: 'sessionStart.provider.executable.discovered',
      values: { path, location: { key: 'sessionStart.provider.location.codex-desktop-app' } },
    });
    expect(
      diagnosis({
        reasonCode: 'EXECUTABLE_NOT_WORKING',
        reason: `Codex at ${path} did not answer.`,
      })?.executable,
    ).toBeUndefined();
    expect(diagnosis({ reasonCode: 'SPECIFICATION_WORKTREE_UNSUPPORTED' })).toEqual({
      found: { key: 'sessionStart.diagnosis.worktree', values: { provider: 'codex' } },
      fixes: [],
    });
  });

  it('says a check without a result does not mean the provider is unavailable', () => {
    const provider = only(
      providerDescriptor({
        providerId: 'codex',
        title: 'Codex',
        readiness: 'unavailable',
        reasonCode: 'PROCESS_SETTLEMENT_UNVERIFIED',
        reason: 'The availability check process did not exit.',
      }),
    );
    expect(provider.diagnosis).toEqual({
      found: { key: 'sessionStart.diagnosis.settlementUnverified', values: { provider: 'Codex' } },
      fixes: [
        {
          applies: 'recheck',
          text: { key: 'sessionStart.diagnosis.settlementFix', values: { provider: 'Codex' } },
        },
      ],
    });
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
      expect(provider.status).toEqual({ key: 'sessionStart.provider.status.setup' });
      expect(provider.diagnosis?.detail).toBe('Not installed');
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
      expect(provider.diagnosis?.found).toEqual({ key: 'sessionStart.provider.noMode' });
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
      expect(provider).toMatchObject({
        status: { key: 'sessionStart.provider.status.unknown' },
        undetermined: true,
        diagnosis: { detail: 'No CLI' },
      });
    });
  });

  it('keeps the mock provider caveat as the note of an available provider', () => {
    expect(only(providerDescriptor({ providerId: 'mock' })).reason).toEqual({
      key: 'managedSession.mockNote',
    });
  });
});
