import { writeFile } from 'node:fs/promises';

import { it } from 'vitest';

import { createProgram } from '../../src/program';

/**
 * Runs one `nevo-specflow` command in a process of its own. The command line comes from the
 * environment as a JSON array; the exit state is written when it returns. A test that kills this
 * process mid-command never gets the file.
 */
it.skipIf(process.env.NEVO_CLI_WORKER !== '1')(
  'runs one CLI command in an independent process',
  async () => {
    // The test kills this very process (the runner, not the supervisor that started it).
    await writeFile(process.env.NEVO_CLI_WORKER_RESULT! + '.pid', String(process.pid));
    const lines: string[] = [];
    const program = createProgram({
      cwd: process.env.NEVO_CLI_WORKER_CWD!,
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });
    const args = JSON.parse(process.env.NEVO_CLI_WORKER_ARGS!) as string[];
    await program.parseAsync(['node', 'nevo-specflow', ...args]);
    await writeFile(process.env.NEVO_CLI_WORKER_RESULT!, JSON.stringify({ lines }));
  },
  240000,
);
