import { partitionAgentPermissionRules } from '@nevo/specflow-contracts/documents';

export interface AllowlistPlan {
  /** What the driver receives; absent when the provider cannot apply an allowlist or none is left. */
  readonly permissions?: { readonly allow: readonly string[] };
  /** What the owner should see in the Turn: what was not applied and why. */
  readonly notice?: string;
}

const MAX_LISTED = 5;

/**
 * Plans the provider allowlist of an Ask agent Turn (D20). A driver that cannot apply one gets
 * nothing and the Turn says so (never a faked restriction); rules the Runtime does not recognise
 * are ignored and named.
 */
export function planPermissionAllowlist(
  provider: string,
  supported: boolean,
  rules: readonly string[],
): AllowlistPlan {
  if (rules.length === 0) {
    return {};
  }

  if (!supported) {
    return {
      notice: `Permission allowlist not supported by ${provider}: ${String(rules.length)} rule(s) were not applied.`,
    };
  }

  const { accepted, ignored } = partitionAgentPermissionRules(rules);
  const listed = ignored
    .slice(0, MAX_LISTED)
    .map((entry) => `"${entry.rule.slice(0, 80)}" (${entry.reason})`)
    .join('; ');

  return {
    ...(accepted.length > 0 ? { permissions: { allow: accepted } } : {}),
    ...(ignored.length > 0
      ? {
          notice: `Ignored ${String(ignored.length)} permission rule(s) for ${provider}: ${listed}${
            ignored.length > MAX_LISTED ? '; ...' : ''
          }.`,
        }
      : {}),
  };
}
