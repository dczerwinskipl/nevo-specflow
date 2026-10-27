import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { expect, it, vi } from 'vitest';

it.runIf(process.platform === 'win32')(
  'kills owned providers and descendants when Runtime is terminated',
  async () => {
    const module = new URL('./windows-job.ts', import.meta.url).href;
    const provider = `
    const {spawn} = require('node:child_process');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio:'ignore'});
    child.once('spawn', () => console.log(child.pid));
    setInterval(() => {}, 1000);
  `;
    const owner = `
    import {spawn} from 'node:child_process';
    import {createWindowsJob} from ${JSON.stringify(module)};
    const job = createWindowsJob(process.execPath, ['-e', ${JSON.stringify(provider)}]);
    const child = spawn(job.executable, job.args, {stdio:['pipe','inherit','inherit','ipc'],windowsHide:true});
    await job.ready(child, process.env);
    setInterval(() => {}, 1000);
  `;
    const runtime = spawn(process.execPath, ['--input-type=module', '-e', owner], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const closed = once(runtime, 'close');
    const lines = createInterface({ input: runtime.stdout });
    try {
      const output = await Promise.race([
        once(lines, 'line'),
        closed.then(() => {
          throw new Error('Runtime exited before provider startup.');
        }),
      ]);
      const pid = Number(output[0]);
      expect(pid).toBeGreaterThan(0);
      runtime.kill(); // TerminateProcess: no cooperative cleanup and no taskkill /T.
      await closed;
      await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow());
    } finally {
      runtime.kill();
      lines.close();
      await closed;
    }
  },
  15000,
);
