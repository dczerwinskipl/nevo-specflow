import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  APP_NAVIGATION_INLINE_PADDING,
  Button,
  NavigationRow,
  Icon,
  ScrollArea,
  Separator,
  Typography,
  useAppNavigation,
} from '@nevo/ui';
import { Link, useMatch, useRouterState } from '@tanstack/react-router';
import { StandaloneLink } from './LocationLink';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import { productNavigationItems, showsNoSpecificationHint } from './productNavigationModel';
import { useSessionDisclosure, type SessionDisclosurePreferences } from './useSessionDisclosure';
import { useNavigationFocus } from './useNavigationFocus';
import { focusHashSection, useHashSectionFocus } from './useHashSectionFocus';
import { useRuntimeMode } from '../useRuntimeMode';
import { designLayerMetadata } from '@nevo/figma-capture/metadata';
import type { AuthStore } from '../../auth/store';
import { AccountMenu } from '../AccountMenu';
import { NevoBrandLogo, defaultNevoBrand } from '../../brand';
import { useSpecificationNavigationSource } from '../../features/specs/overview/useSpecificationNavigationMetadata';
import { useSessionNavigationSummary } from '../../features/sessions/navigation/summary';
import { SpecificationSwitcher } from './SpecificationSwitcher';
import { SessionNavigationPreview } from '../../features/sessions/navigation/SessionNavigationPreview';

export function ProductNavigation({
  auth,
  onSignOut,
  sessionDisclosure,
}: {
  auth: AuthStore;
  onSignOut: () => void | Promise<void>;
  sessionDisclosure: SessionDisclosurePreferences;
}) {
  const { t } = useTranslation();
  const { closeNavigation } = useAppNavigation();
  const location = useRouterState({ select: (state) => state.location });
  const previousLocation = useRef(location);
  useEffect(() => {
    if (previousLocation.current === location) return;
    previousLocation.current = location;
    closeNavigation(() => document.querySelector<HTMLElement>('[data-workspace-active="true"] h1'));
  }, [closeNavigation, location]);
  const collection =
    location.search.collection === 'archive' ? ('archive' as const) : ('current' as const);
  const specId =
    useMatch({
      from: '/_app/specs/$specId',
      shouldThrow: false,
      select: (match) => match.params.specId,
    }) ?? null;
  const navigation = useSpecificationNavigationSource(specId);
  const identity = navigation.metadata;
  const summary = useSessionNavigationSummary(specId);
  const expanded = useSessionDisclosure(
    specId,
    summary,
    sessionDisclosure.preferences,
    sessionDisclosure.setExpanded,
  );
  const demo = useRuntimeMode() === 'demo';
  useNavigationFocus();
  useHashSectionFocus();
  const state = useSyncExternalStore(
    (listener) => auth.subscribe(listener),
    () => auth.getState(),
    () => auth.getState(),
  );
  const views = productNavigationItems(
    specId,
    location.pathname,
    identity?.hasGit,
    location.hash,
    navigation.status !== 'loading',
  );
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ paddingInline: APP_NAVIGATION_INLINE_PADDING }}
      {...designLayerMetadata({ layer: 'product-navigation' })}
    >
      <div
        className="shrink-0 py-5 pr-12"
        data-product-navigation-header
        {...designLayerMetadata({ layer: 'brand' })}
      >
        <NevoBrandLogo {...defaultNevoBrand} product="SpecFlow" size="md" type="horizontal" />
      </div>
      <Separator />
      <nav
        aria-label={t('navigation.product')}
        className="flex min-h-0 flex-1 flex-col"
        {...designLayerMetadata({ layer: 'navigation-links' })}
      >
        {/* The list already holds focusable links: no extra Tab stop and no extra landmark. */}
        <ScrollArea className="min-h-0 flex-1" contentClassName="py-4" tabIndex={-1}>
          <ul className="m-0 grid list-none gap-0.5 p-0">
            <NavigationRow
              selectionTreatment="surface"
              label={t('navigation.specifications')}
              icon={FileText}
              active={!specId && location.pathname === '/'}
              renderLink={(children, className) => (
                <Link
                  to="/"
                  search={{ collection }}
                  className={className}
                  activeOptions={{ exact: true }}
                  onClick={() => {
                    if (location.pathname === '/')
                      closeNavigation(() =>
                        document.querySelector<HTMLElement>('[data-workspace-active="true"] h1'),
                      );
                  }}
                >
                  {children}
                </Link>
              )}
            />
          </ul>
          {specId ? (
            <section
              className="mt-5 min-w-0"
              aria-label={t('applicationNavigation.currentSpecification')}
            >
              <div
                className="rounded-control bg-surface-subtle"
                data-specification-switcher-surface
              >
                <SpecificationSwitcher
                  specId={specId}
                  title={identity?.title ?? t('specification.title')}
                  displayKey={identity?.key}
                  collection={collection}
                  identityAvailable={Boolean(identity)}
                  loading={navigation.status === 'loading'}
                />
                {navigation.status === 'failed' ||
                navigation.status === 'denied' ||
                identity?.stale ? (
                  <Typography
                    as="div"
                    variant="body-sm"
                    className="px-3 pb-2 text-content-secondary"
                    role="status"
                  >
                    {t(
                      identity?.stale
                        ? 'applicationNavigation.staleContext'
                        : 'applicationNavigation.contextUnavailable',
                    )}
                    {navigation.status === 'failed' || identity?.stale ? (
                      <Button variant="ghost" size="sm" className="ml-1" onClick={navigation.retry}>
                        {t('common.retry')}
                      </Button>
                    ) : null}
                  </Typography>
                ) : null}
              </div>
              <ul className="m-0 mt-2 grid list-none gap-0.5 p-0">
                {views.map((view) => (
                  <NavigationRow
                    selectionTreatment="surface"
                    key={view.id}
                    icon={view.icon}
                    label={t(view.labelKey)}
                    active={view.active}
                    renderLink={(children, className) =>
                      view.to === null ? (
                        <span
                          aria-disabled="true"
                          className={className}
                          title={t('applicationNavigation.tasksUnavailable')}
                        >
                          {children}
                        </span>
                      ) : (
                        <Link
                          to={view.to}
                          params={{ specId }}
                          search={
                            view.id === 'changes' ? { collection, source: 'base' } : { collection }
                          }
                          hash={'hash' in view ? view.hash : undefined}
                          className={className}
                          // Overview and Tasks share a route and differ only by #hash: compare the
                          // hash too so exactly one link reports aria-current="page".
                          activeOptions={{
                            exact: view.id === 'overview' || view.id === 'tasks',
                            includeHash: view.id === 'overview' || view.id === 'tasks',
                          }}
                          onClick={
                            view.id === 'tasks'
                              ? () => {
                                  // Re-selecting the already active section does not change the
                                  // URL; still bring the section into view and focus.
                                  if (location.hash === view.hash) focusHashSection(view.hash);
                                }
                              : undefined
                          }
                        >
                          {children}
                        </Link>
                      )
                    }
                    trailing={
                      view.id === 'sessions' && 'count' in summary && summary.count
                        ? t('applicationNavigation.activeCount', { count: summary.count })
                        : undefined
                    }
                    disclosure={
                      view.id === 'sessions' && 'entries' in summary && summary.entries.length
                        ? {
                            expanded,
                            label: t(
                              expanded
                                ? 'applicationNavigation.collapseSessions'
                                : 'applicationNavigation.expandSessions',
                            ),
                            onToggle: () => sessionDisclosure.setExpanded(specId, !expanded),
                            content: (
                              <SessionNavigationPreview
                                entries={summary.entries}
                                renderEntryLink={
                                  demo
                                    ? (sessionId, className, children) => (
                                        <Link
                                          to="/specs/$specId/sessions/$sessionId"
                                          params={{ specId, sessionId }}
                                          search={{ collection }}
                                          className={className}
                                        >
                                          {children}
                                        </Link>
                                      )
                                    : undefined
                                }
                              >
                                <StandaloneLink
                                  to="/specs/$specId/sessions"
                                  params={{ specId }}
                                  search={{ collection }}
                                >
                                  {t('applicationNavigation.allSessions')}
                                  <Icon name="arrow-right" size="sm" className="size-3.5" />
                                </StandaloneLink>
                              </SessionNavigationPreview>
                            ),
                          }
                        : undefined
                    }
                  />
                ))}
              </ul>
              {summary.state === 'unknown' ||
              summary.state === 'unavailable' ||
              summary.state === 'partial' ||
              summary.state === 'stale' ? (
                <div className="px-2 py-1 text-body-sm text-content-secondary" role="status">
                  {t(
                    summary.state === 'stale'
                      ? 'applicationNavigation.staleActivity'
                      : summary.state === 'partial'
                        ? 'applicationNavigation.partialActivity'
                        : 'applicationNavigation.activityUnavailable',
                  )}
                  {summary.state === 'unavailable' && summary.canRetry ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1"
                      onClick={() => void summary.retry()}
                    >
                      {t('common.retry')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : showsNoSpecificationHint(location.pathname) ? (
            <Typography
              as="p"
              variant="body-sm"
              className="mt-5 text-content-secondary"
              role="note"
            >
              <span className="block text-content-primary">
                {t('applicationNavigation.noSpecificationSelectedTitle')}
              </span>
              <span className="mt-1 block">
                {t('applicationNavigation.noSpecificationSelectedDescription')}
              </span>
            </Typography>
          ) : null}
        </ScrollArea>
      </nav>
      <Separator />
      <div
        className="shrink-0 pt-4"
        data-product-navigation-footer
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
