// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceRouteLeaveGuard } from './WorkspaceRouteLeaveGuard';

const mocks = vi.hoisted(() => ({
  canLeaveScope: vi.fn(() => Promise.resolve(true)),
  setGuardPending: vi.fn(),
  shouldBlockFn: undefined as
    undefined | ((args: { current: unknown; next: unknown }) => Promise<boolean> | boolean),
}));

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({}),
  useBlocker: (options: { shouldBlockFn: NonNullable<typeof mocks.shouldBlockFn> }) => {
    mocks.shouldBlockFn = options.shouldBlockFn;
  },
}));
vi.mock('@nevo/ui', () => ({
  useSecondaryNavigation: () => ({ canLeaveScope: mocks.canLeaveScope }),
}));
vi.mock('./NavigationTransition', () => ({
  useNavigationTransition: () => ({ setGuardPending: mocks.setGuardPending }),
}));

const documents = (specId: string, documentId?: string) => ({
  pathname: `/specs/${specId}/documents${documentId ? `/${documentId}` : ''}`,
  fullPath: documentId ? '/specs/$specId/documents/$documentId' : '/specs/$specId/documents',
  params: documentId ? { specId, documentId } : { specId },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WorkspaceRouteLeaveGuard', () => {
  it('does not ask the Secondary stack when document tabs change inside one specification', async () => {
    render(<WorkspaceRouteLeaveGuard />);
    expect(
      await mocks.shouldBlockFn!({ current: documents('s', 'a'), next: documents('s', 'b') }),
    ).toBe(false);
    expect(await mocks.shouldBlockFn!({ current: documents('s', 'a'), next: documents('s') })).toBe(
      false,
    );
    expect(mocks.canLeaveScope).not.toHaveBeenCalled();
    expect(mocks.setGuardPending).not.toHaveBeenCalled();
  });

  it('still asks when the specification or the screen changes', async () => {
    render(<WorkspaceRouteLeaveGuard />);
    await mocks.shouldBlockFn!({ current: documents('s', 'a'), next: documents('other', 'a') });
    await mocks.shouldBlockFn!({
      current: documents('s', 'a'),
      next: { pathname: '/specs/s', fullPath: '/specs/$specId', params: { specId: 's' } },
    });
    expect(mocks.canLeaveScope).toHaveBeenCalledTimes(2);
    expect(mocks.setGuardPending).toHaveBeenCalledWith(true);
  });
});
