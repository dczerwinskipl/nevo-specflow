// @vitest-environment jsdom
import { HttpClientError } from '@nevo/http-client';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { classifyHttpError } from '../../../../api/classify';
import { useRequestKey } from './useAgentAttemptCommands';

/** A mutation whose answer was lost (the request may have been applied). */
const lost = () =>
  classifyHttpError(new HttpClientError('x', { kind: 'network' }), {
    operation: 'workflow',
    method: 'POST',
  });

describe('the idempotency key of an agent attempt command', () => {
  it('is kept for the same request after a lost answer, and new for another payload', () => {
    const { result } = renderHook(() => useRequestKey());
    const keys = result.current;
    const first = keys.next({ step: 'implement', attempt: 1 });
    keys.settled(lost());

    // The same request again: the Runtime returns its recorded answer.
    expect(keys.next({ step: 'implement', attempt: 1 })).toBe(first);
    keys.settled(lost());
    // What is expected changed meanwhile: another request, never the lost one's key.
    const other = keys.next({ step: 'implement', attempt: 2 });
    expect(other).not.toBe(first);
    keys.settled(undefined);
    // Answered: the next request is a new one, even with the same payload.
    expect(keys.next({ step: 'implement', attempt: 2 })).not.toBe(other);
  });
});
