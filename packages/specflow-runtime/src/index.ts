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
