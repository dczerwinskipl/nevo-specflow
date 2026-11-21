import { AGENT_BROKER_ENVIRONMENT } from '@nevo/specflow-contracts/runtime';
import { deriveAgentScope, type SpecFlowEngine } from '@nevo/specflow-engine';

import type { RuntimeFeature } from '../runtime-feature';
import type { InvocationCapabilities } from '../sessions';
import { createBrokerDispatcher, type BrokerDocuments } from './broker/dispatch';
import { createEngineBrokerDocuments } from './broker/documents';
import type { BrokerEndpoint } from './broker/endpoint';
import { createBrokerServer } from './broker/server';
import { createCapabilityRegistry } from './capability/registry';
import { redactCapabilities } from './capability/redaction';

/**
 * Agent execution (D11): the invocation capability of each write Turn and the local broker through
 * which that Turn's product CLI writes, as the Turn's own claim. Sessions receives `capabilities`
 * and mints one per write Turn of a Session associated with a Specification.
 */
export function createAgentExecutionFeature(options: {
  engine: SpecFlowEngine;
  /** Test seams. */
  documents?: BrokerDocuments;
  openEndpoint?: () => Promise<BrokerEndpoint>;
  random?: (size: number) => Buffer;
}): RuntimeFeature & { readonly capabilities: InvocationCapabilities; close(): Promise<void> } {
  const registry = createCapabilityRegistry(options.random ? { random: options.random } : {});
  const dispatcher = createBrokerDispatcher({
    registry,
    documents: options.documents ?? createEngineBrokerDocuments(options.engine),
  });
  const server = createBrokerServer({
    dispatcher,
    ...(options.openEndpoint ? { openEndpoint: options.openEndpoint } : {}),
  });

  const capabilities: InvocationCapabilities = {
    async mint(binding) {
      const endpoint = await server.endpoint();
      const handle = registry.mint({
        invocationId: binding.invocationId,
        sessionId: binding.sessionId,
        turnId: binding.turnId,
        specId: binding.specId,
        workspace: binding.workspace,
        scope: deriveAgentScope({ kind: 'ad-hoc', specId: binding.specId }),
        actor: {
          class: 'agent',
          details: {
            provider: binding.provider,
            ...(binding.model !== undefined ? { model: binding.model } : {}),
            sessionId: binding.sessionId,
          },
        },
      });

      return {
        environment: {
          [AGENT_BROKER_ENVIRONMENT.endpoint]: endpoint,
          [AGENT_BROKER_ENVIRONMENT.capability]: handle.value,
        },
        secrets: [handle.value],
        activate: () => handle.activate(),
        revoke: () => handle.revoke(),
        redact: (text) => redactCapabilities(text, [handle.value]),
      };
    },
  };

  return {
    authorizationResources: [],
    capabilities,
    close: () => server.close(),
    register(app) {
      app.addHook('onClose', () => server.close());
    },
  };
}
