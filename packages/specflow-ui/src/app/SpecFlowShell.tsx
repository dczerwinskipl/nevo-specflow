import { useSessionDisclosurePreferences } from './navigation/useSessionDisclosure';
import { type PropsWithChildren } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { AppShell } from '@nevo/ui';
import { useMatch, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { AuthStore } from '../auth/store';
import { defaultNevoBrand } from '../brand';
import { ProductNavigation } from './navigation/ProductNavigation';
import { NavigationTransitionProvider } from './navigation/NavigationTransition';
import { useSpecificationDocsWorkspace } from '../features/docs';

/**
 * Entering a Specification makes its bound workspace the tab's current documentation workspace.
 * Mounted with the shell itself, not with the navigation: below the Wide layout the navigation is
 * a Drawer that is unmounted while closed.
 */
function SpecificationDocsWorkspaceSync() {
  const specId =
    useMatch({
      from: '/_app/specs/$specId',
      shouldThrow: false,
      select: (match) => match.params.specId,
    }) ?? null;
  useSpecificationDocsWorkspace(specId);

  return null;
}

export function SpecFlowShell({ auth, children }: PropsWithChildren<{ readonly auth: AuthStore }>) {
  const { t } = useTranslation();
  const router = useRouter();
  const sessionDisclosure = useSessionDisclosurePreferences();
  const capture = useDesignMetadata('SpecFlowApplicationShell', { viewport: 'desktop' });

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
      <SpecificationDocsWorkspaceSync />
      <div className="h-dvh w-full" {...capture}>
        <div className="h-full" {...designSlot('SpecFlowApplicationShell', 'shell')}>
          <AppShell
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
