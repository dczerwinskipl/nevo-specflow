import { randomUUID } from 'node:crypto';
import type { Invocation } from '../driver';
import { createInvocationScope, launchOwnedProcess, type ProviderEnvironment } from '../process';
import { SessionError } from '../../errors';
import { antigravityArguments, antigravityModels } from './discovery';
import { parseAntigravityFrame, parseAntigravityInit } from './protocol';

type DiscoveryProcess = Pick<
  Awaited<ReturnType<typeof launchOwnedProcess>>,
  'lines' | 'done' | 'dispose'
>;

/** No user frame is sent. Protocol/configuration discovery is not inference or
 * semantic continuation evidence; each process must still be positively stopped. */
export async function probeAntigravity(
  options: {
    executable: string;
    workspace: string;
    temporaryRoot: string;
    environment: ProviderEnvironment;
    signal: AbortSignal;
    selection: Invocation['selection'];
  },
  launch: (
    options: Parameters<typeof launchOwnedProcess>[0],
  ) => Promise<DiscoveryProcess> = launchOwnedProcess,
) {
  async function inspect<T>(args: string[], read: (owner: DiscoveryProcess) => Promise<T>) {
    options.signal.throwIfAborted();
    const invocationId = randomUUID();
    const scope = await createInvocationScope(options.temporaryRoot, invocationId);
    const owner = await launch({
      ...options,
      invocationId,
      scope,
      cwd: options.workspace,
      args,
      maxFrameBytes: 128 * 1024,
    });
    let result: T | undefined;
    let failure: unknown;
    try {
      result = await read(owner);
    } catch (error) {
      failure = error;
    }

    const disposition = await owner.dispose();
    if (disposition.process.state !== 'stopped') {
      throw new SessionError(
        'PROVIDER_UNAVAILABLE',
        'Antigravity discovery process settlement could not be verified.',
      );
    }

    if (failure instanceof Error) {
      throw failure;
    }

    if (failure || result === undefined) {
      throw new SessionError('PROVIDER_UNAVAILABLE', 'Antigravity discovery failed.');
    }

    return result;
  }

  const models = await inspect(['models'], async (owner) => {
    let output = '';
    for await (const line of owner.lines()) {
      if (Buffer.byteLength(output) + Buffer.byteLength(line) + 1 > 128 * 1024) {
        throw new SessionError(
          'PROVIDER_CATALOGUE_UNAVAILABLE',
          'Antigravity catalogue is too large.',
        );
      }

      output += line + '\n';
    }

    if ((await owner.done).code !== 0) {
      throw new SessionError(
        'PROVIDER_CATALOGUE_UNAVAILABLE',
        'Antigravity catalogue could not be read.',
      );
    }

    return antigravityModels(output);
  });
  const initialization = await inspect(antigravityArguments(options.selection), async (owner) => {
    for await (const line of owner.lines()) {
      return parseAntigravityInit(parseAntigravityFrame(line));
    }

    throw new SessionError('PROVIDER_UNAVAILABLE', 'Antigravity initialization was not received.');
  });

  return { models, initialization };
}
