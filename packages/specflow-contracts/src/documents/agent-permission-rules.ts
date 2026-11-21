import { AGENT_COMMANDS } from './agent-commands';

/**
 * The provider permission allowlist of an agent step execution Turn (D20). The rules an archetype lists per
 * provider are opaque to the Engine; this is the one place that knows the rule syntax the shipped
 * providers read (`Tool` or `Tool(specifier)`), so that the archetype load refuses an over-broad rule
 * and the Runtime applies only rules it recognises. Read-only tools scoped to the workspace and the
 * product CLI commands of `AGENT_COMMANDS` only: never a write tool, never an unrestricted shell.
 *
 * `allow: []` (or no `permissions`) means no allowlist of its own: the Runtime then uses the
 * default allowlist of the provider (`defaultAgentAllowlist`).
 */
export const PRODUCT_CLI = 'nevo-specflow';

/** Tools a scoped rule may allow without a prompt (read-only). */
export const AGENT_READ_TOOLS: ReadonlySet<string> = new Set(['Read', 'Glob', 'Grep']);
/** Tools whose permission would allow a write, a network request or a delegation: never allowed. */
const REFUSED_TOOLS: ReadonlySet<string> = new Set(
  [
    'Edit',
    'Write',
    'MultiEdit',
    'NotebookEdit',
    'WebFetch',
    'WebSearch',
    'Task',
    'Agent',
    'PowerShell',
  ].map((name) => name.toLowerCase()),
);
/** Characters that let a command do more than the one command, or expand to something else. */
const SHELL_UNSAFE = /[;&|<>$`()\\\n\r*?[\]{}]/;
const RETARGETING_OPTIONS = /^--(?:project-root|worktree|workspace-id|to-root)(?:=|$)/;
const RULE = /^([A-Za-z0-9_.*-]+)(?:\(([^]*)\))?$/;
const ABSOLUTE_PATH = /^(?:[/\\~]|[A-Za-z]:)/;

export type AgentPermissionRuleCheck =
  | { readonly kind: 'ok' }
  /** Refused at archetype load: it would allow more than scoped reads and the product CLI. */
  | { readonly kind: 'over-broad'; readonly reason: string }
  /** Not a rule the Runtime recognises: ignored and reported when a Turn starts. */
  | { readonly kind: 'unrecognised'; readonly reason: string };

/** The `AGENT_COMMANDS` key a CLI rule names (`nevo-specflow <key>` or `... <key> *`), if it is one. */
export function agentCliRuleKey(
  specifier: string,
): { readonly key: string; readonly anyArguments: boolean } | undefined {
  const prefix = `${PRODUCT_CLI} `;
  if (!specifier.startsWith(prefix)) {
    return undefined;
  }

  const rest = specifier.slice(prefix.length);
  const anyArguments = rest.endsWith(' *');
  const key = anyArguments ? rest.slice(0, -2) : rest;

  return Object.hasOwn(AGENT_COMMANDS, key) ? { key, anyArguments } : undefined;
}

/** The specifier of a `Bash(...)` rule, if it is one. */
function bashSpecifier(rule: string): string | undefined {
  const match = /^Bash\(([^]*)\)$/.exec(rule);

  return match?.[1];
}

/** Judges one provider rule string against the allowlist policy. */
export function checkAgentPermissionRule(rule: string): AgentPermissionRuleCheck {
  const match = RULE.exec(rule);
  if (!match) {
    return { kind: 'unrecognised', reason: 'It is not a "Tool" or "Tool(specifier)" rule.' };
  }

  const [, name = '', specifier] = match;
  const lower = name.toLowerCase();
  if (name.includes('*') || REFUSED_TOOLS.has(lower)) {
    return { kind: 'over-broad', reason: `${name} is not a read-only tool.` };
  }

  if (lower === 'bash') {
    if (name !== 'Bash') {
      return {
        kind: 'over-broad',
        reason: 'Tool names are case-sensitive; Bash is not a read-only tool.',
      };
    }

    if (specifier === undefined || agentCliRuleKey(specifier) === undefined) {
      return {
        kind: 'over-broad',
        reason: `Bash may allow only "${PRODUCT_CLI} <command>" or "${PRODUCT_CLI} <command> *" for a command the agent may run.`,
      };
    }

    return { kind: 'ok' };
  }

  if (AGENT_READ_TOOLS.has(name)) {
    if (
      specifier === undefined ||
      specifier.trim() === '' ||
      specifier === '*' ||
      specifier === '**'
    ) {
      return { kind: 'over-broad', reason: `${name} must be scoped to a workspace-relative path.` };
    }

    if (specifier.startsWith('**/')) {
      return { kind: 'over-broad', reason: `${name} must not start with a "**/" wildcard.` };
    }

    if (ABSOLUTE_PATH.test(specifier) || specifier.split(/[/\\]/).includes('..')) {
      return {
        kind: 'over-broad',
        reason: `${name} must stay inside the workspace (a relative path).`,
      };
    }

    return { kind: 'ok' };
  }

  if (AGENT_READ_TOOLS.has(name.charAt(0).toUpperCase() + lower.slice(1))) {
    return { kind: 'over-broad', reason: 'Tool names are case-sensitive.' };
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

/**
 * Whether a shell command is exactly one allowlisted product CLI call: it starts with the bare
 * `nevo-specflow` (no path, no `VAR=` prefix), names an allowed `AGENT_COMMANDS` key with a word
 * boundary and carries no shell control, expansion or glob character. The host answers the provider's
 * permission prompt with this; anything else goes to the owner.
 */
export function isAllowlistedCliCommand(command: string, rules: readonly string[]): boolean {
  if (SHELL_UNSAFE.test(command)) {
    return false;
  }

  // Options that point the CLI at another project, worktree or workspace than the Turn's own.
  if (command.split(/\s+/).some((word) => RETARGETING_OPTIONS.test(word.replace(/["']/g, '')))) {
    return false;
  }

  return rules.some((rule) => {
    const specifier = bashSpecifier(rule);
    const entry = specifier === undefined ? undefined : agentCliRuleKey(specifier);
    if (!entry) {
      return false;
    }

    const base = `${PRODUCT_CLI} ${entry.key}`;

    return command === base || (entry.anyArguments && command.startsWith(`${base} `));
  });
}
