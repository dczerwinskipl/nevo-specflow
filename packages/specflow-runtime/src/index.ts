// Nevo SpecFlow Runtime application capability.
//
// Keep the package root intentionally narrow. Transport construction, parsed
// configuration helpers, and test seams remain internal to Runtime.

export { initRuntime, type RuntimeInitOptions } from './init/runtime-init';
export type {
  RuntimeInitContribution,
  RuntimeSetupChoice,
  RuntimeSetupSelectValue,
  RuntimeSetupUi,
} from './init/contracts';
export { startRuntime, type RuntimeHandle, type RuntimeStartOptions } from './runtime';
// Agent Sessions run only in the Runtime that owns the Project's Session store; a Close in any
// other process (the CLI) asks that store's owner record whether an agent can work in a checkout.
export { sessionStoreCheckoutQuiescence } from './features/sessions';
// The product CLI of a write Turn sends its writes to the Runtime's agent broker (D11).
export {
  AgentBrokerClientError,
  agentBrokerEnvironment,
  sendAgentBrokerRequest,
} from './features/agent-execution';
// The one table of the commands an agent may run: the CLI routing and the agent brief read it.
export {
  AGENT_BROKERED_COMMANDS,
  AGENT_COMMANDS,
  AGENT_READ_COMMANDS,
} from '@nevo/specflow-contracts/runtime';
export type { RuntimeWebApp, RuntimeWebAppAsset } from './server/web-app';
