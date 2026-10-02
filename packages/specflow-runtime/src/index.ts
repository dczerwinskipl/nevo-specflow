// Nevo SpecFlow Runtime application capability.
//
// The package owns the long-lived backend boundary. Commander and process lifecycle
// stay in adapters; the capability exposes explicit server construction and shutdown.

export {
  AuthErrorCodeSchema,
  AuthErrorSchema,
  AuthProviderSchema,
  AuthSessionSchema,
  AuthUserSchema,
  PasswordLoginBodySchema,
} from './auth/contracts.js';
export { hashPassword } from './auth/password.js';
export * from './config/index.js';
export { startRuntime, type RuntimeHandle, type RuntimeStartOptions } from './runtime.js';
export { createRuntimeApp, type RuntimeAppDependencies } from './server/app.js';
