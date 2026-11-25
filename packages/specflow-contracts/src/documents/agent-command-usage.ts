/**
 * The usage of a command the agent brief shows, as the real `nevo-specflow` program defines it:
 * generated into `agent-command-usage.generated.ts` from the program itself (see the CLI's
 * `agent-broker/usage.test.ts`), so the brief's argument and option meanings are never hand-written.
 */
export interface AgentCommandUsage {
  readonly arguments: readonly {
    readonly name: string;
    readonly required: boolean;
    readonly variadic: boolean;
    readonly description: string;
  }[];
  readonly options: readonly {
    /** As declared, for example `--content-file <file>`. */
    readonly flags: string;
    readonly long: string;
    readonly required: boolean;
    readonly description: string;
  }[];
}

export { AGENT_COMMAND_USAGE } from './agent-command-usage.generated';
