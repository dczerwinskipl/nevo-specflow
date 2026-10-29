import { randomUUID } from 'node:crypto';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { createInvocationScope, launchOwnedProcess, type ProviderEnvironment } from '../process';
import { object, ClaudeProtocolError } from './protocol';
import { claudeArguments, claudeModels, claudeVersion } from './discovery';
import type { Invocation } from '../driver';

export class ClaudeProbeError extends Error {
  readonly reasonCode: NonNullable<ProviderDescriptor['reasonCode']>;
  constructor(reasonCode: ClaudeProbeError['reasonCode'], message: string) {
    super(message);
    this.reasonCode = reasonCode;
  }
}

/** Initialize without a user message: no paid inference and no invented semantic-resume evidence. */
export async function probeClaude(
  options: {
    executable: string;
    workspace: string;
    temporaryRoot: string;
    environment: ProviderEnvironment;
    secrets: readonly string[];
    signal: AbortSignal;
    selection?: Invocation['selection'];
  },
  launch: typeof launchOwnedProcess = launchOwnedProcess,
) {
  const invocationId = randomUUID();
  const scope = await createInvocationScope(options.temporaryRoot, invocationId);
  const owner = await launch({
    ...options,
    invocationId,
    scope,
    args: claudeArguments(options.selection),
    cwd: options.workspace,
  });
  let result: { models: ProviderDescriptor['models']; version?: string } | undefined;
  let failure: unknown;
  try {
    const requestId = randomUUID();
    await owner.write(
      JSON.stringify({
        type: 'control_request',
        request_id: requestId,
        request: { subtype: 'initialize' },
      }) + '\n',
    );
    for await (const line of owner.lines()) {
      const frame = object(JSON.parse(line));
      if (frame.type !== 'control_response') {
        throw new ClaudeProtocolError();
      }

      const response = object(frame.response);
      if (response.subtype !== 'success' || response.request_id !== requestId) {
        throw new ClaudeProtocolError();
      }

      const payload = object(response.response);
      const models = claudeModels(payload);
      if (!models.length) {
        throw new ClaudeProtocolError();
      }

      const version = claudeVersion(payload);
      result = { models, ...(version ? { version } : {}) };
      break;
    }

    if (!result) {
      throw new ClaudeProbeError(
        'PROBE_FAILED',
        'Claude did not complete protocol initialization.',
      );
    }
  } catch (error) {
    failure =
      error instanceof ClaudeProtocolError || error instanceof SyntaxError
        ? new ClaudeProbeError(
            'PROTOCOL_UNSUPPORTED',
            'Claude initialization does not match the implemented protocol.',
          )
        : error;
  } finally {
    const stopped = await owner.dispose().then(
      (value) => value.process.state === 'stopped',
      () => false,
    );
    if (!stopped) {
      failure = new ClaudeProbeError(
        'PROCESS_SETTLEMENT_UNVERIFIED',
        'Claude probe process settlement could not be verified.',
      );
    }
  }

  if (failure instanceof Error) {
    throw failure;
  }

  if (failure) {
    throw new ClaudeProbeError('PROBE_FAILED', 'Claude initialization failed.');
  }

  if (!result) {
    throw new ClaudeProbeError('PROBE_FAILED', 'Claude initialization is unavailable.');
  }

  return result;
}
