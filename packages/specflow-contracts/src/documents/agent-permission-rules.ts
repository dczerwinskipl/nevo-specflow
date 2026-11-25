import { AGENT_COMMANDS } from './agent-commands';
import { parseAgentShellCommand } from './agent-shell-command';

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
const RETARGETING_OPTIONS = /^--(?:project-root|worktree|workspace-id|to-root)(?:=|$)/;
const RULE = /^([A-Za-z0-9_.*-]+)(?:\(([^]*)\))?$/;
const ABSOLUTE_PATH = /^(?:[/\\~]|[A-Za-z]:)/;
/** An absolute folder in POSIX (`/x`), Windows (`C:\x`, `C:/x`) or Git Bash (`/c/x`) form. */
const ABSOLUTE_FOLDER = /^(?:\/|[A-Za-z]:[\\/])/;

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
 * The paths an allowlisted command touches, all literal words for the host to check against the
 * Turn's worktree (the parser knows no file system):
 *
 * - `cd`: the folder of the leading `cd`, which must be absolute (a relative `cd` is resolved through
 *   `CDPATH` and the shell's current folder, neither of which the host knows);
 * - `outputs`: output redirection targets, allowed only into the scratch folder;
 * - `inputs`: input redirection targets and the values of every `--…-file` option, read by the shell
 *   or the CLI, allowed anywhere inside the worktree.
 *
 * A relative path is relative to the shell's current folder, which the host knows only after the
 * leading absolute `cd`: without one, the host refuses it. `/dev/null` is no file and not listed.
 */
export interface AllowlistedCliPaths {
  readonly cd?: string;
  readonly outputs: readonly string[];
  readonly inputs: readonly string[];
}

export type AgentCliCommandJudgement =
  | { readonly kind: 'allowlisted'; readonly paths: AllowlistedCliPaths }
  | { readonly kind: 'not-allowlisted'; readonly reason: string };

/** A file-valued option (`--content-file`, `--tasks-file`, `--context-file`, …): its value is read. */
const FILE_OPTION = /^--[a-z][a-z-]*-file$/;

/** Whether one parsed simple command is an allowlisted product CLI call (its argv only). */
function allowlistedInvocation(argv: readonly string[], rules: readonly string[]): boolean {
  if (argv[0] !== PRODUCT_CLI) {
    return false;
  }

  // Options that point the CLI at another project, worktree or workspace than the Turn's own.
  if (argv.some((word) => RETARGETING_OPTIONS.test(word))) {
    return false;
  }

  return rules.some((rule) => {
    const specifier = bashSpecifier(rule);
    const entry = specifier === undefined ? undefined : agentCliRuleKey(specifier);
    if (!entry) {
      return false;
    }

    const words = entry.key.split(' ');
    const named = words.every((word, index) => argv[index + 1] === word);

    return named && (entry.anyArguments || argv.length === words.length + 1);
  });
}

/** The values of the file-valued options of a product CLI call; undefined when one has no value. */
function fileOptionValues(argv: readonly string[]): string[] | undefined {
  const values: string[] = [];
  for (let index = 1; index < argv.length; index++) {
    const word = argv[index]!;
    const equals = word.indexOf('=');
    const name = equals === -1 ? word : word.slice(0, equals);
    if (!FILE_OPTION.test(name)) {
      continue;
    }

    const value = equals === -1 ? argv[++index] : word.slice(equals + 1);
    if (value === undefined || value === '') {
      return undefined;
    }

    values.push(value);
  }

  return values;
}

/**
 * Whether a shell command consists only of allowlisted product CLI calls (D20). The command is parsed
 * the way the shell splits it (`parseAgentShellCommand`), never matched as text, and judged
 * fail-closed: every simple command is a bare `nevo-specflow` with an allowlisted command path, joined
 * by `&&`, `;`, `|` or new lines; the list may start with one `cd <absolute folder>` (no option, no
 * relative folder: `cd -P`, `cd --` and friends go home, and a relative one follows `CDPATH`);
 * words are literal (quotes allowed, no expansion, variable, substitution, glob, tilde or
 * environment assignment); redirections are files, `/dev/null`, a descriptor duplicate (`2>&1`) or
 * a here-document with a quoted delimiter. The paths it returns (`AllowlistedCliPaths`) are judged
 * by the host against the worktree. Anything else goes to the owner, with the reason.
 */
export function judgeAgentCliCommand(
  command: string,
  rules: readonly string[],
): AgentCliCommandJudgement {
  const parsed = parseAgentShellCommand(command);
  if (parsed.kind === 'refused') {
    return { kind: 'not-allowlisted', reason: parsed.reason };
  }

  let cd: string | undefined;
  const outputs: string[] = [];
  const inputs: string[] = [];
  for (const [index, simple] of parsed.commands.entries()) {
    if (simple.argv[0] === 'cd') {
      const target = simple.argv[1];
      if (
        index !== 0 ||
        simple.argv.length !== 2 ||
        simple.redirections.length > 0 ||
        simple.next === '|' ||
        simple.next === undefined ||
        target === undefined ||
        target.startsWith('-') ||
        !ABSOLUTE_FOLDER.test(target)
      ) {
        return {
          kind: 'not-allowlisted',
          reason:
            'Only a single leading "cd <absolute folder>" (no option, no relative folder) followed by product CLI calls is allowed.',
        };
      }

      cd = target;
      continue;
    }

    if (!allowlistedInvocation(simple.argv, rules)) {
      return {
        kind: 'not-allowlisted',
        reason: `"${simple.argv.join(' ').slice(0, 120)}" is not an allowlisted ${PRODUCT_CLI} call.`,
      };
    }

    const files = fileOptionValues(simple.argv);
    if (files === undefined) {
      return { kind: 'not-allowlisted', reason: 'A file option has no file.' };
    }

    inputs.push(...files);
    for (const redirection of simple.redirections) {
      if (redirection.kind === 'file' && redirection.target !== '/dev/null') {
        if (redirection.target === '') {
          return { kind: 'not-allowlisted', reason: 'A redirection has no target.' };
        }

        (redirection.operator === '<' ? inputs : outputs).push(redirection.target);
      }
    }
  }

  return {
    kind: 'allowlisted',
    paths: { ...(cd !== undefined ? { cd } : {}), outputs, inputs },
  };
}
