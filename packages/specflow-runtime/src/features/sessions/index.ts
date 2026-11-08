export { createSessionsFeature, type SessionsRuntime } from './feature';
export { runAntigravityHook } from './providers/antigravity/hook-client';
export { parseSessionsFeatureConfig, type SessionsFeatureConfig } from './configuration';
export type { SessionDriver } from './providers/driver';
export { SessionError } from './errors';
export { SessionCapabilities } from '@nevo/specflow-contracts/sessions';
export type {
  SessionAssociations,
  SessionReference,
  SessionReferenceOwner,
} from './reference-owner';
export { registerSessionErrorHandling } from './http/error-handling';
export { authorizeSessionWrite } from './http/authorization';
export { sessionScope, type SessionScopeIdentity, type SessionCapabilityId } from './scope';
export { createDemoSessionReferences } from './demo/references';

export { buildDemoSessions, buildDemoSessionContribution } from './demo/contribution';
export { createDemoSessions, type DemoSessions } from './demo/operations';
export { registerDemoSessionRoutes } from './demo/endpoints';
