import { describe, expect, it, vi } from 'vitest';

import type { SpecFlowEngine } from '../../application';
import {
  checkoutRemovedByClose,
  requireQuietCheckout,
  requireQuietCheckoutBeforeClose,
  withCheckoutQuiescence,
  type CheckoutQuiescence,
} from './checkout-quiescence';
import type { CloseJournal } from './model';

const engine = {} as SpecFlowEngine;
const checkout = { workspaceId: 'linked-1', root: '/repo/linked' };

function journal(plan: Partial<CloseJournal['plan']>, stage = 'reserved'): CloseJournal {
  return {
    stage,
    plan: {
      kind: 'worktree-close',
      source: { workspaceId: 'linked-1', root: '/repo/linked', instanceId: 'i1' },
      target: { workspaceId: 'primary', root: '/repo' },
      ...plan,
    },
  } as unknown as CloseJournal;
}

describe('checkout quiescence', () => {
  it('refuses to remove a checkout when the host gave no answer', async () => {
    await expect(requireQuietCheckout(engine, checkout)).rejects.toMatchObject({
      code: 'CLOSE_BLOCKED',
      blockers: [{ kind: 'session-turn-running', subjectIds: [] }],
    });
  });

  it("refuses with the host's Sessions and explanation, and admits a quiet checkout", async () => {
    const busy: CheckoutQuiescence = () =>
      Promise.resolve({ quiet: false, sessionIds: ['s1'], message: 'An agent works there.' });
    await expect(
      requireQuietCheckout(withCheckoutQuiescence(engine, busy), checkout),
    ).rejects.toMatchObject({
      code: 'CLOSE_BLOCKED',
      message: 'An agent works there.',
      blockers: [{ kind: 'session-turn-running', subjectIds: ['s1'] }],
    });

    const quiet = vi.fn<CheckoutQuiescence>(() => Promise.resolve({ quiet: true }));
    await requireQuietCheckout(withCheckoutQuiescence(engine, quiet), checkout);
    expect(quiet).toHaveBeenCalledWith(checkout);
  });

  it('asks at the start only of a Close that removes a linked checkout', async () => {
    const quiet = vi.fn<CheckoutQuiescence>(() => Promise.resolve({ quiet: true }));
    const host = withCheckoutQuiescence(engine, quiet);

    await requireQuietCheckoutBeforeClose(host, journal({}));
    await requireQuietCheckoutBeforeClose(host, journal({ kind: 'workspace-close' }));
    await requireQuietCheckoutBeforeClose(
      host,
      journal({ kind: 'specification-close', integrateToTargetBranch: true }),
    );
    expect(quiet).toHaveBeenCalledTimes(3);

    quiet.mockClear();
    // Archive-only, a primary checkout, or a removal already under way.
    await requireQuietCheckoutBeforeClose(host, journal({ kind: 'specification-close' }));
    await requireQuietCheckoutBeforeClose(
      host,
      journal({ source: { workspaceId: 'primary', root: '/repo', branch: 'main', head: 'h' } }),
    );
    await requireQuietCheckoutBeforeClose(host, journal({}, 'disposal-initiated'));
    await requireQuietCheckoutBeforeClose(host, journal({}, 'completed'));
    expect(quiet).not.toHaveBeenCalled();
  });

  it('decides with one rule which checkout a Close removes, for Close and its preview', () => {
    const plan = (overrides: Partial<CloseJournal['plan']>) => journal(overrides).plan;
    expect(checkoutRemovedByClose(plan({}))).toEqual(checkout);
    expect(
      checkoutRemovedByClose(plan({ kind: 'specification-close', integrateToTargetBranch: true })),
    ).toEqual(checkout);
    for (const ignored of [
      plan({ kind: 'specification-close', integrateToTargetBranch: false }),
      plan({ kind: 'specification-close' }),
      plan({ source: { workspaceId: 'linked-1', root: '/repo/linked' } } as never),
      plan({ target: undefined }),
    ]) {
      expect(checkoutRemovedByClose(ignored)).toBeUndefined();
    }

    expect(checkoutRemovedByClose(plan({}), 'disposal-initiated')).toBeUndefined();
    expect(checkoutRemovedByClose(plan({}), 'completed')).toBeUndefined();
  });
});
