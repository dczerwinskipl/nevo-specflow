import { describe, expect, it, vi } from 'vitest';
import { createDiscardConsent } from './discardConsent';

describe('the discard the user agreed to for a tree action', () => {
  it('removes the drafts once a successful add (upload, inline create) is confirmed', async () => {
    const remove = vi.fn();
    const consent = createDiscardConsent(remove);
    consent.begin(['a', 'b']);
    await consent.after(() => Promise.resolve());
    expect(remove.mock.calls).toEqual([['a'], ['b']]);
    // Once only.
    consent.confirm();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('loses nothing when the add fails or the next action starts first', async () => {
    const remove = vi.fn();
    const consent = createDiscardConsent(remove);
    consent.begin(['a']);
    await expect(consent.after(() => Promise.reject(new Error('refused')))).rejects.toThrow();
    // A cancelled dialog: the next action starts without the earlier answer.
    consent.begin([]);
    consent.confirm();
    expect(remove).not.toHaveBeenCalled();
  });
});
