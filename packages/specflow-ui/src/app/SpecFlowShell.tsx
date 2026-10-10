import { useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react';

import { designLayerMetadata, designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import {
  APP_NAVIGATION_INLINE_PADDING,
  AppShell,
  Separator,
  SideNavigation,
  useAppNavigation,
  type IconName,
  type NavigationAdapter,
  type NavigationNode,
} from '@nevo/ui';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import type { AuthStore } from '../auth/store';
import { defaultNevoBrand, NevoBrandLogo } from '../brand';
import { AccountMenu } from './AccountMenu';

import { useSpecificationNavigationMetadata } from '../features/specs/overview/useSpecificationNavigationMetadata';

interface NavigationTarget {
  readonly to:
    | '/'
    | '/specs/$specId'
    | '/specs/$specId/documents'
    | '/specs/$specId/sessions'
    | '/specs/$specId/changes'
    | '/specs/$specId/repository';
  readonly params?: { readonly specId: string };
  readonly search?: {
    readonly collection?: 'current' | 'archive';
  };
}

function ProductNavigation({
  auth,
  onSignOut,
}: {
  readonly auth: AuthStore;
  readonly onSignOut: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { closeNavigation } = useAppNavigation();
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });
  const search = useRouterState({
    select: (state) => state.location.search as { readonly collection?: 'current' | 'archive' },
  });
  const activeSpecMatch = useRouterState({
    select: (state) => state.matches.find((match) => 'specId' in match.params),
  });
  const activeSpecId =
    activeSpecMatch && 'specId' in activeSpecMatch.params
      ? String(activeSpecMatch.params.specId)
      : null;
  const activeView = pathname.includes('/tasks/')
    ? null
    : pathname.endsWith('/documents')
      ? 'documents'
      : pathname.includes('/documents/')
        ? 'documents'
        : pathname.endsWith('/sessions')
          ? 'sessions'
          : pathname.endsWith('/changes')
            ? 'changes'
            : pathname.endsWith('/repository')
              ? 'repository'
              : null;
  const collection = search?.collection ?? 'current';

  const specMetadata = useSpecificationNavigationMetadata(activeSpecId);

  const state = useSyncExternalStore(
    (listener) => auth.subscribe(listener),
    () => auth.getState(),
    () => auth.getState(),
  );

  const [expandedKeys, setExpandedKeys] = useState<readonly string[]>(() =>
    activeSpecId ? [`spec-${activeSpecId}`] : [],
  );

  useEffect(() => {
    if (activeSpecId) {
      setExpandedKeys((prev) =>
        prev.includes(`spec-${activeSpecId}`) ? prev : [...prev, `spec-${activeSpecId}`],
      );
    }
  }, [activeSpecId]);

  const navigationNodes = useMemo<readonly NavigationNode<NavigationTarget>[]>(() => {
    const rootNodes: NavigationNode<NavigationTarget>[] = [
      {
        key: 'specs',
        label: t('navigation.specifications'),
        target: { to: '/', search: { collection } },
      },
    ];

    if (activeSpecId) {
      const docCount = specMetadata?.documentCount;
      const docsLabel =
        docCount !== undefined
          ? `${t('specification.viewDocuments')} ${docCount}`
          : t('specification.viewDocuments');
      const hasGit = specMetadata?.hasGit !== false;

      rootNodes.push({
        key: `spec-${activeSpecId}`,
        label: activeSpecId,
        target: {
          to: '/specs/$specId',
          params: { specId: activeSpecId },
          search: { collection },
        },
        children: [
          {
            key: `spec-view-documents`,
            label: docsLabel,
            target: {
              to: '/specs/$specId/documents',
              params: { specId: activeSpecId },
              search: { collection },
            },
          },
          {
            key: `spec-view-sessions`,
            label: t('specification.viewSessions'),
            target: {
              to: '/specs/$specId/sessions',
              params: { specId: activeSpecId },
              search: { collection },
            },
          },
          ...(hasGit
            ? [
                {
                  key: `spec-view-changes`,
                  label: t('specification.viewChanges'),
                  target: {
                    to: '/specs/$specId/changes' as const,
                    params: { specId: activeSpecId },
                    search: { collection },
                  },
                },
                {
                  key: `spec-view-repository`,
                  label: t('specification.viewRepository'),
                  target: {
                    to: '/specs/$specId/repository' as const,
                    params: { specId: activeSpecId },
                    search: { collection },
                  },
                },
              ]
            : []),
        ],
      });
    }

    return rootNodes;
  }, [activeSpecId, collection, specMetadata, t]);

  const rootIcons = useMemo(() => {
    const icons: Record<string, IconName> = {
      specs: 'workflow',
    };
    if (activeSpecId) {
      icons[`spec-${activeSpecId}`] = 'file';
    }
    return icons;
  }, [activeSpecId]);

  const navigationAdapter = useMemo<NavigationAdapter<NavigationTarget>>(
    () => ({
      match: (node) => {
        if (node.key === 'specs') {
          return pathname === '/' ? 'active' : 'none';
        }
        if (activeView && node.key === `spec-view-${activeView}`) {
          return 'active';
        }
        if (node.key === `spec-${activeSpecId}`) {
          return pathname === `/specs/${encodeURIComponent(activeSpecId ?? '')}`
            ? 'active'
            : 'ancestor';
        }
        return 'none';
      },
      renderLink: ({ children, className, node }) => {
        if (!node.target) {
          return <span className={className}>{children}</span>;
        }
        if (node.target.to === '/') {
          return (
            <Link
              className={className}
              to="/"
              search={{ collection: node.target.search?.collection ?? 'current' }}
              onClick={closeNavigation}
            >
              {children}
            </Link>
          );
        }
        const specParams = node.target.params!;
        const routeSearch = { collection: node.target.search?.collection ?? collection };
        const to = node.target.to;
        if (to === '/specs/$specId/documents')
          return (
            <Link
              className={className}
              to="/specs/$specId/documents"
              params={specParams}
              search={routeSearch}
              onClick={closeNavigation}
            >
              {children}
            </Link>
          );
        if (to === '/specs/$specId/sessions')
          return (
            <Link
              className={className}
              to="/specs/$specId/sessions"
              params={specParams}
              search={routeSearch}
              onClick={closeNavigation}
            >
              {children}
            </Link>
          );
        if (to === '/specs/$specId/changes')
          return (
            <Link
              className={className}
              to="/specs/$specId/changes"
              params={specParams}
              search={{ ...routeSearch, source: 'base' }}
              onClick={closeNavigation}
            >
              {children}
            </Link>
          );
        if (to === '/specs/$specId/repository')
          return (
            <Link
              className={className}
              to="/specs/$specId/repository"
              params={specParams}
              search={routeSearch}
              onClick={closeNavigation}
            >
              {children}
            </Link>
          );
        return (
          <Link
            className={className}
            to="/specs/$specId"
            params={specParams}
            search={routeSearch}
            onClick={closeNavigation}
          >
            {children}
          </Link>
        );
      },
    }),
    [closeNavigation, pathname, activeSpecId, activeView, collection],
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ paddingInline: APP_NAVIGATION_INLINE_PADDING }}
      {...designLayerMetadata({ layer: 'product-navigation' })}
    >
      <div
        className="shrink-0 py-5 pr-12"
        data-product-navigation-header="true"
        {...designLayerMetadata({ layer: 'brand' })}
      >
        <NevoBrandLogo {...defaultNevoBrand} product="SpecFlow" size="md" type="horizontal" />
      </div>

      <Separator />

      <SideNavigation
        aria-label={t('navigation.product')}
        adapter={navigationAdapter}
        className="min-h-0 flex-1 overflow-y-auto py-4"
        nodes={navigationNodes}
        rootIcons={rootIcons}
        expandedKeys={expandedKeys}
        onExpandedKeysChange={setExpandedKeys}
        {...designLayerMetadata({ layer: 'navigation-links' })}
      />

      <Separator />

      <div
        className="shrink-0 pt-4"
        data-product-navigation-footer="true"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        {...designLayerMetadata({ layer: 'account-footer' })}
      >
        {state.status === 'ready' ? (
          <AccountMenu session={state.session} onSignOut={onSignOut} />
        ) : null}
      </div>
    </div>
  );
}

export function SpecFlowShell({ auth, children }: PropsWithChildren<{ readonly auth: AuthStore }>) {
  const { t } = useTranslation();
  const router = useRouter();
  const capture = useDesignMetadata('SpecFlowApplicationShell', { viewport: 'desktop' });

  const signOut = async () => {
    const operation = auth.logout();
    const expectedMutation = auth.mutationGeneration();
    try {
      await operation;
      if (auth.mutationGeneration() !== expectedMutation) return;
      await router.navigate({ to: '/login', search: { returnTo: '/' }, replace: true });
    } catch {
      if (auth.mutationGeneration() !== expectedMutation) return;
      await router.navigate({
        to: '/runtime-unavailable',
        search: { returnTo: '/' },
        replace: true,
      });
    }
  };

  return (
    <div className="h-dvh w-full" {...capture}>
      <div className="h-full" {...designSlot('SpecFlowApplicationShell', 'shell')}>
        <AppShell
          brandPrimary={defaultNevoBrand.coreColor}
          labels={{
            closeNavigation: t('navigation.close'),
            navigationTitle: t('navigation.title'),
          }}
          navigation={<ProductNavigation auth={auth} onSignOut={signOut} />}
        >
          {children}
        </AppShell>
      </div>
    </div>
  );
}
