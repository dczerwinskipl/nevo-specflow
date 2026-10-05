import { useMemo, useSyncExternalStore, type PropsWithChildren } from 'react';

import { designLayerMetadata, designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import {
  APP_SHELL_GAP,
  AppShell,
  Separator,
  SideNavigation,
  useAppNavigation,
  type NavigationAdapter,
  type NavigationNode,
} from '@nevo/ui';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import type { AuthStore } from '../auth/store';
import { defaultNevoBrand, NevoBrandLogo } from '../brand';
import { AccountMenu } from './AccountMenu';

interface NavigationTarget {
  readonly to: '/' | '/ui-playground';
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
  const state = useSyncExternalStore(
    (listener) => auth.subscribe(listener),
    () => auth.getState(),
    () => auth.getState(),
  );

  const navigationNodes = useMemo<readonly NavigationNode<NavigationTarget>[]>(
    () => [
      { key: 'home', label: t('navigation.home'), target: { to: '/' } },
      {
        key: 'ui-playground',
        label: t('navigation.uiPlayground'),
        target: { to: '/ui-playground' },
      },
    ],
    [t],
  );

  const navigationAdapter = useMemo<NavigationAdapter<NavigationTarget>>(
    () => ({
      match: (node) => (node.target?.to === pathname ? 'active' : 'none'),
      renderLink: ({ children, className, node }) => (
        <Link className={className} to={node.target?.to ?? '/'} onClick={closeNavigation}>
          {children}
        </Link>
      ),
    }),
    [closeNavigation, pathname],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ paddingInline: APP_SHELL_GAP }}
      {...designLayerMetadata({ layer: 'product-navigation' })}
    >
      <div className="shrink-0 py-4 pr-12" {...designLayerMetadata({ layer: 'brand' })}>
        <NevoBrandLogo {...defaultNevoBrand} product="SpecFlow" size="md" type="horizontal" />
      </div>

      <Separator />

      <SideNavigation
        aria-label={t('navigation.product')}
        adapter={navigationAdapter}
        className="min-h-0 flex-1 overflow-y-auto py-4"
        nodes={navigationNodes}
        {...designLayerMetadata({ layer: 'navigation-links' })}
      />

      <Separator />

      <div
        className="shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
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
    try {
      await auth.logout();
      await router.navigate({ to: '/login', search: { returnTo: '/' }, replace: true });
    } catch {
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
