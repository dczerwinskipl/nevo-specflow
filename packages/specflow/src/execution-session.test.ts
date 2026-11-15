import { TasksOpenError } from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import { reportingWorkflowRefusals } from './execution-session';
import { ReportedFailure } from './exit-code';

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout,
    stderr,
    output: {
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    },
  };
}

describe('reportingWorkflowRefusals', () => {
  it('prints each open Task of a refused completion, with a hint and the JSON details', async () => {
    const openTasks = [
      { taskId: 'api', cause: 'active' as const },
      { taskId: 'screen', cause: 'broken' as const },
    ];
    const { stdout, stderr, output } = capture();

    await expect(
      reportingWorkflowRefusals(output, true, () => Promise.reject(new TasksOpenError(openTasks))),
    ).rejects.toBeInstanceOf(ReportedFailure);

    expect(stderr[0]).toMatch(/^WORKFLOW_TASKS_OPEN: /u);
    expect(stderr).toContain('  open task api: active');
    expect(stderr).toContain('  open task screen: broken');
    expect(stderr.at(-1)).toMatch(/^Hint: Finish or cancel the open Tasks/u);
    expect(JSON.parse(stdout[0] ?? '')).toMatchObject({
      error: { code: 'WORKFLOW_TASKS_OPEN', openTasks },
    });
  });
});
