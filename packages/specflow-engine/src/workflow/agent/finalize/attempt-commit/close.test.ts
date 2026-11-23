import { describe, expect, it } from 'vitest';

import { specificationAttemptCommitWaitOf } from './close';

const SPEC = 'spec-1';

describe('the attempt commit wait of a Specification', () => {
  it('is none while every journal is read and none waits', () => {
    expect(
      specificationAttemptCommitWaitOf({ journals: [], unreadable: [], truncated: false }, SPEC),
    ).toBeUndefined();
  });

  it.each([
    ['a journal cannot be read', { unreadable: ['2a1d7b63-7b54-4d66-8e4f-2c8b6e3a9d02'] }],
    ['the listing was cut short', { truncated: true }],
  ])('fails closed when %s: the unread journal may be the one that waits', (_name, listing) => {
    expect(() =>
      specificationAttemptCommitWaitOf(
        { journals: [], unreadable: [], truncated: false, ...listing },
        SPEC,
      ),
    ).toThrow(expect.objectContaining({ code: 'WORKFLOW_STATE_CORRUPT' }));
  });
});
