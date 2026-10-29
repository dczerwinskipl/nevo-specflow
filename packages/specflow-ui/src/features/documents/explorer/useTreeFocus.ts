import { useEffect, useRef, useState } from 'react';
import type { DocumentTreeIndex, TreeRows } from './documentTreePolicy';

export interface TreeFocus {
  /** Ref callback of a row's button: `key` is `doc:<id>` or `folder:<path>`. */
  register: (key: string) => (node: HTMLButtonElement | null) => void;
  /**
   * Moves focus to the row `key` as soon as it is rendered (an operation may still be replacing
   * the tree). `folder:` alone means the root: the first row of the list.
   */
  request: (key: string) => void;
}

/** Focus restoration for tree rows that are replaced or created by operations. */
export function useTreeFocus(index: DocumentTreeIndex<TreeRows>): TreeFocus {
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const [target, setTarget] = useState<string>();
  useEffect(() => {
    if (!target) {
      return;
    }

    // Root-level creation has no source row (its action lives in the header menu): land on the list.
    const root = index.level('');
    const first = root.folders[0]
      ? 'folder:' + root.folders[0].path
      : root.documents[0]
        ? 'doc:' + root.documents[0].id
        : '';
    const node = nodes.current.get(target === 'folder:' ? first : target);
    if (node) {
      node.focus();
      setTarget(undefined);
    }
  }, [target, index]);

  return {
    register: (key) => (node) => {
      if (node) {
        nodes.current.set(key, node);
      } else {
        nodes.current.delete(key);
      }
    },
    request: setTarget,
  };
}
