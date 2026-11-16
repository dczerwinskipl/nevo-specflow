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
export type { RuntimeWebApp, RuntimeWebAppAsset } from './server/web-app';
