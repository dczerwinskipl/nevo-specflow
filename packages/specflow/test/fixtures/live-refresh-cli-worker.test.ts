import { writeFile } from 'node:fs/promises';

import { it } from 'vitest';

import { createProgram } from '../../src/program';

it.skipIf(!process.env.NEVO_LIVE_REFRESH_ROOT)(
  'creates a canonical Spec through an independent CLI process',
  async () => {
    const lines: string[] = [];
    const program = createProgram({
      cwd: process.env.NEVO_LIVE_REFRESH_ROOT!,
      stdout: (line) => lines.push(line),
      stderr: (line) => {
        throw new Error(line);
      },
    });

    if (process.env.NEVO_LIVE_REFRESH_CLOSE_SPEC_ID) {
      await program.parseAsync([
        'node',
        'nevo-specflow',
        'specs',
        'close',
        process.env.NEVO_LIVE_REFRESH_CLOSE_SPEC_ID,
        '--operation-id',
        process.env.NEVO_LIVE_REFRESH_CLOSE_OPERATION!,
        '--yes',
        '--json',
      ]);
    } else {
      await program.parseAsync([
        'node',
        'nevo-specflow',
        'specs',
        'create',
        '--archetype',
        'minimal',
        '--title',
        process.env.NEVO_LIVE_REFRESH_TITLE!,
        '--json',
      ]);
    }

    if (lines.length !== 1) {
      throw new Error('Expected exactly one JSON result from independent CLI command.');
    }

    await writeFile(process.env.NEVO_LIVE_REFRESH_RESULT!, lines[0]!);
  },
  120000,
);
