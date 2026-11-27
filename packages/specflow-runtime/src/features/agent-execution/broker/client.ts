import { connect } from 'node:net';

import {
  AGENT_BROKER_ENVIRONMENT,
  AGENT_BROKER_LIMITS,
  AGENT_BROKER_PROTOCOL,
  AgentBrokerResponseSchema,
  type AgentBrokerOperation,
  type AgentBrokerResponse,
} from '@nevo/specflow-contracts/runtime';
import { Value } from 'typebox/value';

import { readFrame } from './framing';

/** The broker a write Turn's product CLI must use, from its environment; `undefined` outside one. */
export function agentBrokerEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): { readonly endpoint: string; readonly capability: string } | undefined {
  const capability = environment[AGENT_BROKER_ENVIRONMENT.capability];
  const endpoint = environment[AGENT_BROKER_ENVIRONMENT.endpoint];
  if (!capability) {
    return undefined;
  }

  // A capability without its broker is an agent Turn that cannot write; never fall back to the Engine.
  if (!endpoint) {
    throw new AgentBrokerClientError(
      'The agent capability is set but the broker endpoint is missing; tell the owner.',
    );
  }

  return { endpoint, capability };
}

/** The broker could not be reached or answered something that is not a response of this protocol. */
export class AgentBrokerClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentBrokerClientError';
  }
}

/**
 * Sends one request to the broker and returns its response: a refusal is a response
 * (`ok: false`), never an exception. `requestId` identifies the request for a retry: the same id
 * in the same Turn is an exact replay. The capability is never written anywhere else.
 */
export async function sendAgentBrokerRequest(options: {
  readonly endpoint: string;
  readonly capability: string;
  readonly requestId: string;
  readonly operation: AgentBrokerOperation;
  readonly signal?: AbortSignal;
}): Promise<AgentBrokerResponse> {
  const frame =
    JSON.stringify({
      protocol: AGENT_BROKER_PROTOCOL,
      capability: options.capability,
      requestId: options.requestId,
      operation: options.operation,
    }) + '\n';
  if (Buffer.byteLength(frame) > AGENT_BROKER_LIMITS.requestBytes) {
    throw new AgentBrokerClientError('The request is larger than the broker accepts.');
  }

  const socket = connect({ path: options.endpoint });
  const abort = () => socket.destroy();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', () =>
        reject(new AgentBrokerClientError('The agent broker of this Turn is not reachable.')),
      );
    });
    socket.write(frame);
    let text: string;
    try {
      text = await readFrame(socket, AGENT_BROKER_LIMITS.responseBytes);
    } catch {
      throw new AgentBrokerClientError('The agent broker closed without an answer.');
    }

    let response: unknown;
    try {
      response = JSON.parse(text);
    } catch {
      response = undefined;
    }

    if (!Value.Check(AgentBrokerResponseSchema, response)) {
      throw new AgentBrokerClientError('The agent broker answered an invalid response.');
    }

    return response;
  } finally {
    options.signal?.removeEventListener('abort', abort);
    socket.destroy();
  }
}
