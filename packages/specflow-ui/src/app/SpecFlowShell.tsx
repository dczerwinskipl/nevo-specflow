import { useSessionDisclosurePreferences } from './navigation/useSessionDisclosure';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { AppShell } from '@nevo/ui';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { AuthStore } from '../auth/store';
import { defaultNevoBrand } from '../brand';
import { isA2Family, layoutPrototype, snapLeftBelowPx } from './layoutPrototype';
import { ProductNavigation } from './navigation/ProductNavigation';
import { NavigationTransitionProvider } from './navigation/NavigationTransition';
/** PROTOTYPE (A2): anchor the shell left when a centred group would only leave a small margin. */
function usePrototypeSnapLeft() {
  const [snap, setSnap] = useState(false);
  useEffect(() => {
    if (!isA2Family) {
      return;
    }

    const id = window.setInterval(() => {
      const nav = document.querySelector('[data-app-shell-region="navigation"]');
      const ws = document.querySelector('[data-app-shell-region="workspace"]');
      if (!nav || !ws) {
        return;
      }

      const used = nav.getBoundingClientRect().width + 8 + ws.getBoundingClientRect().width;
      setSnap(window.innerWidth - used < snapLeftBelowPx);
    }, 100);

    return () => window.clearInterval(id);
  }, []);

  return snap;
}

export function SpecFlowShell({ auth, children }: PropsWithChildren<{ readonly auth: AuthStore }>) {
  const { t } = useTranslation();
  const router = useRouter();
  const sessionDisclosure = useSessionDisclosurePreferences();
  const capture = useDesignMetadata('SpecFlowApplicationShell', { viewport: 'desktop' });
  const snapLeft = usePrototypeSnapLeft();

  const signOut = async () => {
    const operation = auth.logout();
    const expectedMutation = auth.mutationGeneration();
    try {
      await operation;
      if (auth.mutationGeneration() !== expectedMutation) {
        return;
      }

      await router.navigate({ to: '/login', search: { returnTo: '/' }, replace: true });
    } catch {
      if (auth.mutationGeneration() !== expectedMutation) {
        return;
      }

      await router.navigate({
        to: '/runtime-unavailable',
        search: { returnTo: '/' },
        replace: true,
      });
    }
  };

  return (
    <NavigationTransitionProvider>
      <div className="h-dvh w-full" {...capture}>
        <div className="h-full" {...designSlot('SpecFlowApplicationShell', 'shell')}>
          <AppShell
            className={layoutPrototype === 'D' || snapLeft ? 'justify-start!' : undefined}
            brandPrimary={defaultNevoBrand.coreColor}
            labels={{
              closeNavigation: t('navigation.close'),
              navigationTitle: t('navigation.title'),
            }}
            navigation={
              <ProductNavigation
                auth={auth}
                onSignOut={signOut}
                sessionDisclosure={sessionDisclosure}
              />
            }
          >
            {children}
          </AppShell>
        </div>
      </div>
    </NavigationTransitionProvider>
  );
}
