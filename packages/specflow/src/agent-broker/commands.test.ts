// Every command the agent brief shows exists in the real program, is not refused, and uses only
// options and arguments the command has.
import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';

import { AGENT_COMMANDS } from '@nevo/specflow-runtime';

import { createProgram } from '../program';
import { placementOf } from './routing';

function find(program: Command, words: string[]): Command | undefined {
  let current: Command | undefined = program;
  for (const word of words) {
    current = current.commands.find((candidate) => candidate.name() === word);
    if (!current) {
      return undefined;
    }
  }

  return current;
}

const program = createProgram({
  stdout: () => undefined,
  stderr: () => undefined,
  cwd: '.',
  environment: {},
});

describe('agent brief command forms', () => {
  const contexts = [
    { specId: 'S1' },
    { specId: 'S1', taskId: 'T1' },
    { specId: 'S1', templateIds: ['t1'] },
  ];

  for (const [path, entry] of Object.entries(AGENT_COMMANDS)) {
    if (!entry.form) {
      continue;
    }

    it(`${path} is a registered, permitted command with real options and arguments`, () => {
      for (const context of contexts) {
        const form = entry.form!(context);
        const words = path.split(' ');
        expect(form.startsWith(path)).toBe(true);

        const command = find(program, words);
        expect(command, `${path} is registered`).toBeDefined();
        expect(placementOf(path)).toBe(entry.placement);

        const flags = [...form.matchAll(/--[a-z][a-z-]*/g)].map((match) => match[0]);
        const known = new Set(command!.options.map((option) => option.long));
        for (const flag of flags) {
          expect(known.has(flag), `${path} has ${flag}`).toBe(true);
        }

        const positionals =
          form
            .slice(path.length)
            .replace(/--[a-z][a-z-]*( <[^>]+>)?/g, '')
            .match(/(<[^>]+>|S1)/g) ?? [];
        const required = command!.registeredArguments.filter((argument) => argument.required);
        const variadic = command!.registeredArguments.some((argument) => argument.variadic);
        expect(positionals.length).toBeGreaterThanOrEqual(required.length);
        if (!variadic) {
          expect(positionals.length).toBeLessThanOrEqual(command!.registeredArguments.length);
        }
      }
    });
  }
});
