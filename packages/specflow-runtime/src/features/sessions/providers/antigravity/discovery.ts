import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import type { Invocation } from '../driver';
import { SessionError } from '../../errors';

export const antigravityModes = [
  { modeId: 'accept-edits', nativeMode: 'accept-edits', title: 'Agent', mode: 'workspace-write' },
  // Native Plan is a planning instruction, not a filesystem permission boundary.
  { modeId: 'plan', nativeMode: 'plan', title: 'Plan (workspace write)', mode: 'workspace-write' },
] as const;

export function antigravityMode(selection: Invocation['selection']) {
  const mode = antigravityModes.find(
    (candidate) => candidate.modeId === (selection.providerModeId ?? 'accept-edits'),
  );
  if (selection.mode !== mode?.mode) {
    throw new SessionError(
      'CAPABILITY_UNSUPPORTED',
      'Select a native Antigravity mode with managed workspace execution authority.',
    );
  }

  return mode;
}

export function antigravityArguments(
  selection: Invocation['selection'],
  context?: Invocation['providerContext'],
) {
  const mode = antigravityMode(selection);
  const args = [
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--disable-slash-commands',
    '--sandbox',
    '--mode',
    mode.nativeMode,
  ];
  if (context?.resume) {
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(context.nativeSessionId)) {
      throw new SessionError('SESSION_INPUT_INVALID', 'Invalid native Antigravity context.');
    }

    args.push('--conversation', context.nativeSessionId);
  }

  if (selection.modelId) {
    args.push('--model', selection.modelId);
  }

  if (selection.effort) {
    args.push('--effort', selection.effort);
  }

  return args;
}

/** Native `agy models` is a bounded CLI catalogue, never an inference prompt.
 * Do not accept arbitrary log lines as model identifiers or infer effort levels
 * from an opaque model slug. Effort discovery needs its own native evidence. */
export function antigravityModels(output: string): ProviderDescriptor['models'] {
  if (Buffer.byteLength(output) > 128 * 1024) {
    throw new SessionError(
      'PROVIDER_CATALOGUE_UNAVAILABLE',
      'Antigravity model catalogue is too large.',
    );
  }

  const models: ProviderDescriptor['models'] = [];
  const identifiers = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Fetching ')) {
      continue;
    }

    const row = /^([A-Za-z0-9][A-Za-z0-9_.:/-]{0,255})(?:\t+| {2,})(.+)$/.exec(trimmed);
    if (!row || Buffer.byteLength(row[2]!) > 512 || identifiers.has(row[1]!)) {
      throw new SessionError(
        'PROVIDER_CATALOGUE_UNAVAILABLE',
        'Invalid Antigravity model catalogue.',
      );
    }

    identifiers.add(row[1]!);
    models.push({ modelId: row[1]!, title: row[2]!.trim(), efforts: [] });
    if (models.length > 100) {
      throw new SessionError(
        'PROVIDER_CATALOGUE_UNAVAILABLE',
        'Antigravity model catalogue is too large.',
      );
    }
  }

  if (!models.length) {
    throw new SessionError('PROVIDER_CATALOGUE_UNAVAILABLE', 'Antigravity returned no models.');
  }

  return models;
}
