import {
  SessionAuthorization,
  SettingsAuthorization,
  SpecAuthorization,
} from '@nevo/specflow-contracts';

const viewerCapabilities = [
  SpecAuthorization.capabilities.View,
  SessionAuthorization.capabilities.View,
] as const;

const developerCapabilities = [
  ...viewerCapabilities,
  SpecAuthorization.capabilities.Create,
  SpecAuthorization.capabilities.Manage,
  SessionAuthorization.capabilities.Create,
  SessionAuthorization.capabilities.Manage,
] as const;

const adminCapabilities = [
  ...developerCapabilities,
  SettingsAuthorization.capabilities.View,
  SettingsAuthorization.capabilities.Manage,
] as const;

export const SPEC_FLOW_ROLES = {
  viewer: viewerCapabilities,
  developer: developerCapabilities,
  admin: adminCapabilities,
} as const;

export type SpecFlowRole = keyof typeof SPEC_FLOW_ROLES;

export function isSpecFlowRole(value: string): value is SpecFlowRole {
  return Object.hasOwn(SPEC_FLOW_ROLES, value);
}
