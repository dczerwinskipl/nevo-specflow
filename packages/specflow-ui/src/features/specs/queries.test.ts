import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { specificationKeys } from './queries';

describe('Specification Query key scope', () => {
  it('invalidates workspace, documents and Tasks together but not another Specification', async () => {
    const queryClient = new QueryClient();
    const id = 'admission';
    const other = 'security';
    const keys = [
      specificationKeys.detail(id),
      specificationKeys.document(id, 'spec'),
      specificationKeys.task(id, 'TASK-02'),
    ];
    for (const key of keys) queryClient.setQueryData(key, { revision: 1 });
    queryClient.setQueryData(specificationKeys.detail(other), { revision: 2 });

    await queryClient.invalidateQueries({
      queryKey: specificationKeys.spec(id),
      refetchType: 'none',
    });

    for (const key of keys) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
    expect(queryClient.getQueryState(specificationKeys.detail(other))?.isInvalidated).toBe(false);
  });
});
