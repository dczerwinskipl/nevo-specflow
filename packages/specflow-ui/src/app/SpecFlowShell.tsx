import { useSyncExternalStore, type PropsWithChildren } from 'react';

import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { AppShell, useAppNavigation } from '@nevo/ui';
import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import type { AuthStore } from '../auth/store';
import { defaultNevoBrand, NevoBrandLogo } from '../brand';
import { AccountMenu } from './AccountMenu';

function ProductNavigation({
  auth,
  onSignOut,
}: {
  readonly auth: AuthStore;
  readonly onSignOut: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { closeNavigation } = useAppNavigation();
  const state = useSyncExternalStore(
    (listener) => auth.subscribe(listener),
    () => auth.getState(),
    () => auth.getState(),
  );
  const linkClassName =
    'block rounded-control px-3 py-2 text-content-secondary hover:bg-surface-hover hover:text-content-primary';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pt-5 pr-12">
        <NevoBrandLogo {...defaultNevoBrand} product="SpecFlow" size="md" type="horizontal" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-8">
        <nav aria-label={t('navigation.product')} className="grid gap-1">
          <Link
            activeProps={{ className: `${linkClassName} bg-surface-selected` }}
            className={linkClassName}
            to="/"
            onClick={closeNavigation}
          >
            {t('navigation.home')}
          </Link>
          <Link
            activeProps={{ className: `${linkClassName} bg-surface-selected` }}
            className={linkClassName}
            to="/ui-playground"
            onClick={closeNavigation}
          >
            {t('navigation.uiPlayground')}
          </Link>
        </nav>
      </div>
      <div className="shrink-0 border-t border-divider px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        {state.status === 'ready' ? (
          <AccountMenu session={state.session} onSignOut={onSignOut} />
        ) : null}
      </div>
    </div>
  );
}

export function SpecFlowShell({
  auth,
  children,
}: PropsWithChildren<{ readonly auth: AuthStore }>) {
  const { t } = useTranslation();
  const router = useRouter();
  const capture = useDesignMetadata('SpecFlowApplicationShell', { viewport: 'desktop' });

  const signOut = async () => {
    await auth.logout();
    await router.navigate({ to: '/login', search: { returnTo: '/' }, replace: true });
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
