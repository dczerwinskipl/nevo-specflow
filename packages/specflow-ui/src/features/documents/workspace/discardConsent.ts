/**
 * The drafts the user agreed to discard for the tree action being prepared. They go only once that
 * action is confirmed by the Runtime (an operation, or an add such as an upload or an inline
 * create); a cancelled dialog, a failed tree read or a refused action loses nothing, and the next
 * action starts empty. Owned by the tree panel and used from its handlers only.
 */
export interface DiscardConsent {
  /** A new action starts: the drafts the user agreed to discard for it (none to keep drafts). */
  begin: (ids: readonly string[]) => void;
  /** The action was confirmed: the agreed drafts go now (once). */
  confirm: () => void;
  /** Runs `work` and confirms the discard only when it succeeded. */
  after: <T>(work: () => Promise<T>) => Promise<T>;
}

export function createDiscardConsent(remove: (id: string) => void): DiscardConsent {
  let agreed: string[] = [];
  const confirm = () => {
    for (const id of agreed.splice(0)) {
      remove(id);
    }
  };

  return {
    begin: (ids) => {
      agreed = [...ids];
    },
    confirm,
    after: async (work) => {
      const result = await work();
      confirm();

      return result;
    },
  };
}
