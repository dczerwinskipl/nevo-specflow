import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createSpecificationWorkspaceFixture } from '../../../../test-support/specs/workspace/fixtures';
import { specificationKeys } from '../queries';
import { useSpecificationNavigationMetadata } from './useSpecificationNavigationMetadata';

function renderNavigation(queryClient: QueryClient, specId: string | null): string {
  function NavigationProbe() {
    const metadata = useSpecificationNavigationMetadata(specId);
    return (
      <span>
        {metadata
          ? `${metadata.title}|${metadata.documentCount}|${String(metadata.hasGit)}`
          : 'unknown'}
      </span>
    );
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <NavigationProbe />
    </QueryClientProvider>,
  );
}

describe('Specification navigation metadata', () => {
  it('does not fetch Workspace for a directly opened Task or Document', () => {
    const queryClient = new QueryClient();
    const getWorkspace = vi.fn().mockRejectedValue(new Error('Workspace unavailable'));
    queryClient.setQueryDefaults(specificationKeys.detail('s'), {
      queryFn: getWorkspace,
    });

    expect(renderNavigation(queryClient, 's')).toContain('unknown');
    expect(getWorkspace).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(specificationKeys.detail('s'))?.fetchStatus).toBe('idle');
  });

  it('reuses cached Workspace navigation metadata without copying its server state', () => {
    const queryClient = new QueryClient();
    const data = createSpecificationWorkspaceFixture('no-git', 's');
    queryClient.setQueryData(specificationKeys.detail('s'), data);

    expect(renderNavigation(queryClient, 's')).toContain(
      `${data.title}|${data.documents.length}|false`,
    );
    expect(renderNavigation(queryClient, null)).toContain('unknown');
  });
});
