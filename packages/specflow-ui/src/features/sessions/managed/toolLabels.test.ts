import { describe, expect, it } from 'vitest';
import type { WorkSummary } from '@nevo/specflow-contracts/sessions';
import { createSpecFlowI18n } from '../../../i18n';
import { workFailureText, workItemTitle, workItemTitleParts } from './toolLabels';

const t = createSpecFlowI18n('en').t;
const base: WorkSummary = {
  workId: 'w',
  ordinal: 1,
  revision: 1,
  kind: 'tool',
  state: 'completed',
  title: { text: 'Bash', complete: true },
  createdAt: '2026-11-24T10:00:00Z',
  updatedAt: '2026-11-24T10:00:01Z',
};

describe('Work history labels', () => {
  it('names tool Work by what it did, then on what, never by the provider', () => {
    expect(
      workItemTitleParts(t, { ...base, operation: 'command', subject: 'mkdir -p /tmp/job …' }),
    ).toEqual({ label: 'Ran command', subject: 'mkdir -p /tmp/job …' });
    expect(
      workItemTitle(t, {
        ...base,
        title: { text: 'Write', complete: true },
        operation: 'write',
        subject: 'dummy/job.sh',
        actionCount: 3,
      }),
    ).toBe('Wrote file and 2 more · dummy/job.sh');
    // Work recorded with nothing to name it by keeps the Runtime's own title.
    expect(workItemTitle(t, base)).toBe('Bash');
  });

  it('heads a permission with what the person decided, that it waits, or that it was answered', () => {
    const permission: WorkSummary = {
      ...base,
      kind: 'interaction',
      operation: 'command',
      subject: 'rm -rf dummy',
    };
    expect(workItemTitleParts(t, { ...permission, decision: 'allowed' })).toEqual({
      label: 'Allowed',
      subject: 'rm -rf dummy',
    });
    expect(workItemTitleParts(t, { ...permission, decision: 'denied' }).label).toBe('Denied');
    expect(workItemTitleParts(t, { ...permission, state: 'active' }).label).toBe('Waiting for you');
    expect(workItemTitleParts(t, permission).label).toBe('Answered');
  });

  it('says a known failure in plain words and keeps the raw reason for others', () => {
    expect(
      workFailureText(t, {
        ...base,
        state: 'failed',
        subject: '…/dummy-job/job.sh',
        failure: {
          subject: '…/dummy-job/job.sh',
          message: String.raw`\tmp\dummy-job\job.sh is outside .; --restricted confines the file tools to the working directory.`,
          reason: 'outside-worktree',
        },
      }),
    ).toBe('Outside the worktree: the agent can read and write files only inside the worktree.');
    expect(
      workFailureText(t, {
        ...base,
        state: 'failed',
        subject: 'dummy/job.sh',
        failure: { subject: 'dummy/test.sh', message: 'File has not been read yet.' },
      }),
    ).toBe('dummy/test.sh: File has not been read yet.');
    expect(workFailureText(t, base)).toBeUndefined();
  });
});
