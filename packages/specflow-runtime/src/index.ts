// Nevo SpecFlow Runtime application capability.
//
// The package owns the long-lived backend boundary. Commander and process lifecycle
// stay in adapters; the capability exposes explicit server construction and shutdown.

export { startRuntime, type RuntimeHandle, type RuntimeStartOptions } from './runtime.js';
export { createRuntimeApp, type RuntimeAppDependencies } from './server/app.js';
export * from './config/index.js';
export {
  authenticatedSession,
  configuredAuthProviders,
  configuredUser,
  unauthenticatedSession,
  type AuthProvider,
  type AuthSession,
  type AuthUser,
} from './auth/session.js';
