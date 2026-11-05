import { useLayoutEffect, useRef } from 'react';

/**
 * Identity for the Work history's derived groups — Commentary-headed chapters, the runs of
 * operations between narration, and tool groups. None has an id of its own: each is a span of Work
 * items, and an older page joining it at the front, an item arriving at its end or a filter
 * changes which items it holds. Keyed by its first item, a group was re-created whenever an older
 * page joined it, dropping its subtree's DOM and the reader's focus in it.
 *
 * A group keeps its key while it keeps any of its members: each group takes the key that its
 * earliest member had in the previous render, unless an earlier group already took it (a group
 * that a filter split in two); otherwise — a new group, or the second half of a split one — its
 * first member's id, made unique among its siblings.
 */
export function assignGroupKeys(
  groups: readonly (readonly string[])[],
  previous: ReadonlyMap<string, string>,
): { keys: string[]; byMember: Map<string, string> } {
  const used = new Set<string>();
  const byMember = new Map<string, string>();
  const keys = groups.map((members) => {
    let key = members
      .map((member) => previous.get(member))
      .find((candidate) => candidate !== undefined && !used.has(candidate));
    if (key === undefined) {
      key = members[0] ?? 'group';
      for (let suffix = 1; used.has(key); suffix += 1) {
        key = `${members[0] ?? 'group'}#${suffix}`;
      }
    }

    used.add(key);
    for (const member of members) {
      byMember.set(member, key);
    }

    return key;
  });

  return { keys, byMember };
}

/** `assignGroupKeys` across renders: the keys of `groups` (each a list of member ids, in order),
 * remembered from the last committed render. */
export function useGroupKeys(groups: readonly (readonly string[])[]): string[] {
  const committed = useRef<ReadonlyMap<string, string>>(new Map());
  const { keys, byMember } = assignGroupKeys(groups, committed.current);
  useLayoutEffect(() => {
    committed.current = byMember;
  });

  return keys;
}
