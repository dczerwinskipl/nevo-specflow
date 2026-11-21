import { createHash } from 'node:crypto';

import {
  AgentBrokerClientError,
  agentBrokerEnvironment,
  sendAgentBrokerRequest,
} from '@nevo/specflow-runtime';

type SendOptions = Parameters<typeof sendAgentBrokerRequest>[0];

/** An operation of the agent broker protocol, as the CLI sends it. */
export type BrokerOperation = SendOptions['operation'];
export type BrokerResponse = Awaited<ReturnType<typeof sendAgentBrokerRequest>>;

/** The seam a command sends its write through: the real pipe, or a fake in a test. */
export interface AgentBrokerTransport {
  send(requestId: string, operation: BrokerOperation): Promise<BrokerResponse>;
}

/**
 * How this process relates to the Runtime's agent broker (D11). `none`: not inside an agent Turn,
 * the CLI behaves as always. `broker`: inside one, every write goes to the broker. `broken`: the
 * environment names a capability but no usable broker; nothing may write (never a local fallback).
 */
export type AgentRoute =
  | { readonly kind: 'none' }
  | { readonly kind: 'broker'; readonly transport: AgentBrokerTransport }
  | { readonly kind: 'broken'; readonly message: string };

export function agentRouteOf(
  environment: Readonly<Record<string, string | undefined>>,
  transport?: AgentBrokerTransport,
): AgentRoute {
  // The broker without a capability is as unusable as the reverse: never read as "not an agent Turn".
  if (environment.NEVO_AGENT_BROKER && !environment.NEVO_AGENT_CAPABILITY) {
    return {
      kind: 'broken',
      message: 'The agent broker endpoint is set but the capability is missing; tell the owner.',
    };
  }

  let target: ReturnType<typeof agentBrokerEnvironment>;
  try {
    target = agentBrokerEnvironment(environment);
  } catch (error) {
    if (error instanceof AgentBrokerClientError) {
      return { kind: 'broken', message: error.message };
    }

    throw error;
  }

  if (target === undefined) {
    return { kind: 'none' };
  }

  return {
    kind: 'broker',
    transport: transport ?? {
      send: (requestId, operation) => sendAgentBrokerRequest({ ...target, requestId, operation }),
    },
  };
}

/**
 * The id of a brokered command: the same command (operation and arguments) in the same Turn has the
 * same id, so an agent that repeats it after a lost answer gets the replay, not a second write.
 */
export function stableRequestId(operation: BrokerOperation): string {
  return `cli-${createHash('sha256').update(JSON.stringify(operation)).digest('hex').slice(0, 40)}`;
}

export { AgentBrokerClientError };
