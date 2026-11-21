/**
 * The provider permission allowlist of an Ask agent Turn (D20). The rules an archetype lists per
 * provider are opaque to the Engine; this is the one place that knows the rule syntax the
 * shipped providers read (`Tool` or `Tool(specifier)`), so that the archetype load refuses an
 * over-broad rule and the Runtime applies only rules it recognises. Read-only tools and the product
 * CLI only: never a write tool, never an unrestricted shell.
 */
export const PRODUCT_CLI = 'nevo-specflow';

/** Tools a rule may allow without a prompt (read-only). */
export const AGENT_READ_TOOLS: ReadonlySet<string> = new Set(['Read', 'Glob', 'Grep']);
/** Tools whose permission would allow a write, a network request or a delegation: never allowed. */
const REFUSED_TOOLS: ReadonlySet<string> = new Set([
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'Task',
  'Agent',
  'PowerShell',
]);
const SHELL_CONTROL = /[;&|<>$`()\\\n\r]/;
const RULE = /^([A-Za-z0-9_.*-]+)(?:\(([^]*)\))?$/;

export type AgentPermissionRuleCheck =
  | { readonly kind: 'ok' }
  /** Refused at archetype load: it would allow more than read-only tools and the product CLI. */
  | { readonly kind: 'over-broad'; readonly reason: string }
  /** Not a rule the Runtime recognises: ignored and reported when a Turn starts. */
  | { readonly kind: 'unrecognised'; readonly reason: string };

/** Judges one provider rule string against the allowlist policy. */
export function checkAgentPermissionRule(rule: string): AgentPermissionRuleCheck {
  const match = RULE.exec(rule.trim());
  if (!match || rule !== rule.trim()) {
    return { kind: 'unrecognised', reason: 'It is not a "Tool" or "Tool(specifier)" rule.' };
  }

  const [, name = '', specifier] = match;
  if (name.includes('*') || REFUSED_TOOLS.has(name)) {
    return { kind: 'over-broad', reason: `${name} is not a read-only tool.` };
  }

  if (name === 'Bash') {
    if (specifier === undefined || specifier.trim() === '') {
      return { kind: 'over-broad', reason: 'Bash must name the product CLI command it allows.' };
    }

    const onlyProductCli =
      /^nevo-specflow(?: [^]*|:\*)?$/.test(specifier) && !SHELL_CONTROL.test(specifier);

    return onlyProductCli
      ? { kind: 'ok' }
      : { kind: 'over-broad', reason: `Bash may allow only ${PRODUCT_CLI} commands.` };
  }

  if (AGENT_READ_TOOLS.has(name)) {
    return { kind: 'ok' };
  }

  return { kind: 'unrecognised', reason: `The tool ${name} is not one the Runtime allows.` };
}

export interface AgentPermissionAllowlist {
  readonly accepted: readonly string[];
  readonly ignored: readonly { readonly rule: string; readonly reason: string }[];
}

/** Splits rules into those the Runtime applies and those it ignores (over-broad or unrecognised). */
export function partitionAgentPermissionRules(rules: readonly string[]): AgentPermissionAllowlist {
  const accepted: string[] = [];
  const ignored: { rule: string; reason: string }[] = [];
  for (const rule of rules) {
    const check = checkAgentPermissionRule(rule);
    if (check.kind === 'ok') {
      accepted.push(rule);
    } else {
      ignored.push({ rule, reason: check.reason });
    }
  }

  return { accepted, ignored };
}
