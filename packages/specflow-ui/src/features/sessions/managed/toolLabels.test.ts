import { describe, expect, it } from 'vitest';
import type { WorkSummary } from '@nevo/specflow-contracts/sessions';
import { createSpecFlowI18n } from '../../../i18n';
import { workFailureText, workItemTitle } from './toolLabels';

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
  it('names tool Work by what it did and on what, never by the provider', () => {
    expect(
      workItemTitle(t, { ...base, operation: 'command', subject: 'mkdir -p /tmp/job …' }),
    ).toBe('Ran command · mkdir -p /tmp/job …');
    expect(
      workItemTitle(t, {
        ...base,
        title: { text: 'Write', complete: true },
        operation: 'write',
        subject: 'dummy/job.sh',
        actionCount: 3,
      }),
    ).toBe('Wrote file · dummy/job.sh and 2 more');
    // Work recorded before subjects existed keeps the Runtime's own title.
    expect(workItemTitle(t, base)).toBe('Bash');
  });

  it('says what the person decided on a permission, or that it waits for them', () => {
    const permission: WorkSummary = {
      ...base,
      kind: 'interaction',
      operation: 'command',
      subject: 'rm -rf dummy',
    };
    expect(workItemTitle(t, { ...permission, decision: 'allowed' })).toBe(
      'Allowed: Ran command · rm -rf dummy',
    );
    expect(workItemTitle(t, { ...permission, decision: 'denied' })).toBe(
      'Denied: Ran command · rm -rf dummy',
    );
    expect(workItemTitle(t, { ...permission, state: 'active' })).toBe(
      'Waiting for you: Ran command · rm -rf dummy',
    );
  });

  it('says what failed and why on the row', () => {
    expect(
      workFailureText({
        ...base,
        state: 'failed',
        failure: { subject: 'dummy/test.sh', message: 'File has not been read yet.' },
      }),
    ).toBe('dummy/test.sh: File has not been read yet.');
    expect(workFailureText(base)).toBeUndefined();
  });
});
