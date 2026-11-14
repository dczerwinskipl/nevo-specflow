/**
 * Read model of the workspaces feature: the registered workspaces of the project
 * (`GET /api/workspaces`), its query key and hook. A leaf entry shared by Create Specification and
 * the documentation reader.
 */
export { createRuntimeWorkspaceApi, workspacesReadOperation, type WorkspaceApi } from './api';
export { workspaceKeys } from './queries';
export { useWorkspaces, type UseWorkspacesOptions } from './useWorkspaces';
export { workspaceUnavailableMessage } from './unavailableReason';
