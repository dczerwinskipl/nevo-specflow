// Generates the CLI usage the agent brief shows (`AGENT_COMMAND_USAGE` in the contracts) from the
// real program, so the brief's argument and option meanings are never hand-written. The generated
// file is a Vitest file snapshot: a CLI change fails this test until it is regenerated with
// `pnpm --filter @nevo/specflow exec vitest run src/agent-broker/usage.test.ts -u`.
import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';

import { AGENT_COMMANDS } from '@nevo/specflow-runtime';

import { createProgram } from '../program';

const program = createProgram({
  stdout: () => undefined,
  stderr: () => undefined,
  cwd: '.',
  environment: {},
});

function find(words: readonly string[]): Command | undefined {
  let current: Command | undefined = program;
  for (const word of words) {
    current = current.commands.find((candidate) => candidate.name() === word);
    if (!current) {
      return undefined;
    }
  }

  return current;
}

/** The usage of every command the brief shows: its arguments and options, as the program has them. */
function usage() {
  return Object.fromEntries(
    Object.entries(AGENT_COMMANDS)
      .filter(([, entry]) => entry.form !== undefined)
      .map(([path]) => {
        const command = find(path.split(' '));
        if (!command) {
          throw new Error(`The program has no command ${path}.`);
        }

        return [
          path,
          {
            arguments: command.registeredArguments.map((argument) => ({
              name: argument.name(),
              required: argument.required,
              variadic: argument.variadic,
              description: argument.description,
            })),
            options: command.options
              .filter((option) => option.long !== undefined && !option.hidden)
              .map((option) => ({
                flags: option.flags,
                long: option.long!,
                required: option.mandatory,
                description: option.description,
              })),
          },
        ];
      }),
  );
}

describe('agent command usage', () => {
  it('is generated from the real program', async () => {
    const source = [
      '// GENERATED from the nevo-specflow program by packages/specflow/src/agent-broker/usage.test.ts.',
      '// Do not edit: regenerate with `pnpm --filter @nevo/specflow exec vitest run src/agent-broker/usage.test.ts -u`.',
      "import type { AgentCommandUsage } from './agent-command-usage';",
      '',
      `export const AGENT_COMMAND_USAGE: Readonly<Record<string, AgentCommandUsage>> = ${JSON.stringify(usage(), null, 2)};`,
      '',
    ].join('\n');

    await expect(source).toMatchFileSnapshot(
      '../../../specflow-contracts/src/documents/agent-command-usage.generated.ts',
    );
  });
});
