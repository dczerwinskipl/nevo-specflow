import { useState } from 'react';
import type { SpecsCollection } from '../model';

/**
 * The search term of the visible collection. A term belongs to the collection it was typed in:
 * the other collection shows an empty search (nothing is cleared in an effect) and the term is
 * back when the user returns.
 */
export function useCollectionSearch(collection: SpecsCollection) {
  const [search, setSearch] = useState({ collection, value: '' });
  const term = search.collection === collection ? search.value : '';

  return {
    term,
    setTerm: (value: string) => setSearch({ collection, value }),
    clear: () => setSearch({ collection, value: '' }),
  };
}
