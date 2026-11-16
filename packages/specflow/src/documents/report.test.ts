import { DocumentError } from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import { hintFor } from './report';

const busy = (cause: string) =>
  new DocumentError('SPEC_BUSY', 'An agent Session Turn holds the claim.', {
    reason: 'busy',
    cause,
  });

describe('the hint of a refusal by an agent execution claim', () => {
  it('says to run the command again once a running Turn has ended', () => {
    expect(hintFor(busy('agent-turn'))).toContain('once that Turn has ended');
  });

  it('says to resolve the Session when the Turn ended without a known outcome', () => {
    const hint = hintFor(busy('agent-turn-unknown'));
    expect(hint).toContain('use Check outcome, or recover the Session');
    expect(hint).not.toContain('once that Turn has ended');
  });
});
