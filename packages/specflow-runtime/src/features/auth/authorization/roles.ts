export const SPEC_FLOW_ROLE_IDS = ['viewer', 'developer', 'admin'] as const;

export type SpecFlowRoleId = (typeof SPEC_FLOW_ROLE_IDS)[number];

const SPEC_FLOW_ROLE_ID_SET: ReadonlySet<string> = new Set(SPEC_FLOW_ROLE_IDS);

export function isSpecFlowRoleId(value: string): value is SpecFlowRoleId {
  return SPEC_FLOW_ROLE_ID_SET.has(value);
}
