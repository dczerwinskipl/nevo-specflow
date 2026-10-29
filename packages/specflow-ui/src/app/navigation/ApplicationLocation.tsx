import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BackLink, LocationLink } from './LocationLink';
import {
  Breadcrumbs,
  BreadcrumbItem,
  hitAreaClassName,
  Icon,
  Typography,
  WorkspaceHeader,
  useWorkspaceCapabilities,
  type WorkspaceHeaderAction,
  type WorkspaceHeaderProps,
} from '@nevo/ui';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSpecificationNavigationSource } from '../../features/specs/overview/useSpecificationNavigationMetadata';
export type ApplicationView =
  | 'specifications'
  | 'overview'
  | 'sessions'
  | 'tasks'
  | 'documents'
  | 'changes'
  | 'repository'
  | 'task'
  | 'document'
  | 'new-specification'
  | 'new-session'
  | 'session';
export function applicationLocationHeader({
  title,
  view,
  specId,
  detailLabel,
  actions,
  labels,
}: {
  title: string;
  view: ApplicationView;
  specId?: string;
  detailLabel?: string;
  actions?: readonly WorkspaceHeaderAction[];
  labels?: WorkspaceHeaderProps['labels'];
}) {
  return (
    <LocalizedWorkspaceHeader
      title={title}
      as="span"
      actions={actions ? [...actions] : undefined}
      labels={labels}
      identityContent={
        <ApplicationLocationIdentity
          title={title}
          view={view}
          specId={specId}
          detailLabel={detailLabel}
        />
      }
    />
  );
}

function LocalizedWorkspaceHeader({ labels, ...props }: WorkspaceHeaderProps) {
  const { t } = useTranslation();

  return (
    <WorkspaceHeader {...props} labels={{ moreActions: t('common.moreActions'), ...labels }} />
  );
}

export function ApplicationLocationIdentity(props: {
  title: string;
  view: ApplicationView;
  specId?: string;
  detailLabel?: string;
}) {
  const router = useRouter({ warn: false });

  return router?.state.matches.some((match) => match.routeId.startsWith('/_app/')) ? (
    <RoutedIdentity {...props} />
  ) : (
    <span className="text-title-sm text-content-primary">{props.title}</span>
  );
}

function RoutedIdentity({
  title,
  view,
  specId,
  detailLabel,
}: {
  title: string;
  view: ApplicationView;
  specId?: string;
  detailLabel?: string;
}) {
  const { t } = useTranslation();
  const { supportsSplit } = useWorkspaceCapabilities();
  const { collection, identity, contextNotice, parent } = useApplicationLocationModel(specId, view);
  if (!supportsSplit) {
    return (
      <span className="text-title-sm text-content-primary" title={contextNotice}>
        {title}
        {contextNotice ? <span className="sr-only"> · {contextNotice}</span> : null}
      </span>
    );
  }

  return (
    <RegionalLocation title={title}>
      <Breadcrumbs label={t('applicationNavigation.location')} className="min-w-0">
        {[
          <BreadcrumbItem key="collection" current={!specId && view !== 'new-specification'}>
            {specId || view === 'new-specification' ? (
              <LocationLink
                to="/"
                search={{ collection }}
                aria-label={t('applicationNavigation.allSpecifications')}
              >
                {t('navigation.specifications')}
              </LocationLink>
            ) : (
              title
            )}
          </BreadcrumbItem>,
          ...(specId
            ? [
                <BreadcrumbItem key="specification" current={false}>
                  <LocationLink
                    className="block max-w-48 truncate"
                    title={identity}
                    aria-label={identity}
                    to="/specs/$specId"
                    params={{ specId }}
                    search={{ collection }}
                  >
                    {identity}
                  </LocationLink>
                </BreadcrumbItem>,
              ]
            : []),
          ...(parent
            ? [
                <BreadcrumbItem key="parent" current={false}>
                  {parent.to && specId ? (
                    <LocationLink to={parent.to} params={{ specId }} search={{ collection }}>
                      {parent.label}
                    </LocationLink>
                  ) : (
                    parent.label
                  )}
                </BreadcrumbItem>,
              ]
            : []),
          ...(specId || view === 'new-specification'
            ? [
                <BreadcrumbItem key="view" current>
                  {detailLabel ?? title}
                </BreadcrumbItem>,
              ]
            : []),
        ]}
      </Breadcrumbs>
    </RegionalLocation>
  );
}

function useApplicationLocationModel(specId: string | undefined, view: ApplicationView) {
  const { t } = useTranslation();
  const collection = useRouterState({
    select: (s) =>
      s.location.search.collection === 'archive' ? ('archive' as const) : ('current' as const),
  });
  const navigation = useSpecificationNavigationSource(specId ?? null);
  const metadata = navigation.metadata;
  const identity = metadata?.key ?? metadata?.title ?? t('specification.title');
  // Only a settled failure is reported; loading is never presented as "unavailable".
  const contextNotice =
    navigation.status === 'failed' || navigation.status === 'denied' || metadata?.stale
      ? t(
          metadata?.stale
            ? 'applicationNavigation.staleContext'
            : 'applicationNavigation.contextUnavailable',
        )
      : undefined;
  const parent =
    view === 'document'
      ? { label: t('specification.viewDocuments'), to: '/specs/$specId/documents' as const }
      : view === 'session' || view === 'new-session'
        ? { label: t('specification.viewSessions'), to: '/specs/$specId/sessions' as const }
        : view === 'task'
          ? { label: t('specification.viewTasks'), to: null }
          : undefined;
  const mobileBack =
    view === 'session' || view === 'new-session'
      ? { label: t('specification.viewSessions'), to: '/specs/$specId/sessions' as const }
      : view === 'overview' || view === 'new-specification'
        ? { label: t('applicationNavigation.allSpecifications'), to: '/' as const }
        : parent?.to
          ? parent
          : {
              label: t('applicationNavigation.specificationOverview'),
              to: '/specs/$specId' as const,
            };

  return {
    collection,
    metadata,
    identity,
    contextNotice,
    parent,
    mobileBack,
  };
}

export function ApplicationContextLine({
  specId,
  view,
  className,
}: {
  specId?: string;
  view: ApplicationView;
  className?: string;
}) {
  const router = useRouter({ warn: false });
  const { supportsSplit } = useWorkspaceCapabilities();
  if (
    !router?.state.matches.some((match) => match.routeId.startsWith('/_app/')) ||
    supportsSplit ||
    (!specId && view !== 'new-specification')
  ) {
    return null;
  }

  return <MobileContext specId={specId} view={view} className={className} />;
}

function MobileContext({
  specId,
  view,
  className,
}: {
  specId?: string;
  view: ApplicationView;
  className?: string;
}) {
  const { collection, metadata, contextNotice, mobileBack } = useApplicationLocationModel(
    specId,
    view,
  );
  const content = <ApplicationBackContent>{mobileBack.label}</ApplicationBackContent>;

  return (
    <Typography
      as="div"
      variant="body-sm"
      className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 ${className ?? 'mb-6'}`}
      data-application-context
    >
      <BackLink
        to={mobileBack.to}
        params={mobileBack.to === '/' ? undefined : { specId }}
        search={{ collection }}
      >
        {content}
      </BackLink>
      {metadata?.key ? (
        <span className="whitespace-nowrap text-content-secondary">· {metadata.key}</span>
      ) : null}
      {contextNotice ? (
        <span className="text-content-secondary" role="status">
          {contextNotice}
        </span>
      ) : null}
    </Typography>
  );
}

export function ViewPageTitle({
  children,
  className = 'mb-6',
}: {
  children: string;
  className?: string;
}) {
  return (
    <Typography
      as="h1"
      variant="title-lg"
      tabIndex={-1}
      className={`${className} text-content-primary outline-none [overflow-wrap:anywhere]`}
      data-page-title
    >
      {children}
    </Typography>
  );
}

/** Same contextual navigation treatment for route ancestors and local flow steps. */
export const applicationBackClassName = [
  'inline-flex min-w-0 items-center gap-1.5 text-content-secondary outline-none focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50',
  hitAreaClassName,
].join(' ');
export function ApplicationBackContent({ children }: { children: ReactNode }) {
  return (
    // One flex row: the DS Link wraps its children in a label span, so the icon and text must
    // not rely on the anchor being the flex container.
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon name="arrow-right" size="sm" className="shrink-0 rotate-180" />
      <span>{children}</span>
    </span>
  );
}

export function ApplicationFlowBack({
  label,
  onBack,
  disabled,
}: {
  label: string;
  onBack: () => void;
  disabled?: boolean;
}) {
  return (
    <Typography as="div" variant="body-sm">
      <button
        type="button"
        className={applicationBackClassName}
        disabled={disabled}
        onClick={onBack}
      >
        <ApplicationBackContent>{label}</ApplicationBackContent>
      </button>
    </Typography>
  );
}

export function useApplicationCollection() {
  return useRouterState({
    select: (s) =>
      s.location.search.collection === 'archive' ? ('archive' as const) : ('current' as const),
  });
}

export function ApplicationSessionBack({
  specId,
  sessionId,
  collection,
}: {
  specId: string;
  sessionId: string;
  collection: 'current' | 'archive';
}) {
  const { t } = useTranslation();

  return (
    <Typography as="div" variant="body-sm">
      <BackLink
        to="/specs/$specId/sessions/$sessionId"
        params={{ specId, sessionId }}
        search={{ collection }}
      >
        <ApplicationBackContent>{t('applicationNavigation.sessionBack')}</ApplicationBackContent>
      </BackLink>
    </Typography>
  );
}

/**
 * Wide location trail. When the trail does not fit (e.g. a compact Primary beside a Secondary),
 * only the current title is shown: the persistent navigation already shows the location, so a
 * second overflow control next to the header actions would be redundant.
 */
function RegionalLocation({ title, children }: { title: string; children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null),
    measure = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }

    const update = () => setCompact((measure.current?.scrollWidth ?? 0) > element.clientWidth);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (measure.current) {
      observer.observe(measure.current);
    }

    update();

    return () => observer.disconnect();
  }, [title, children]);

  return (
    <div
      ref={host}
      className="relative flex min-w-0 items-center gap-2"
      data-application-location={compact ? 'compact' : 'full'}
    >
      <div
        ref={measure}
        aria-hidden
        inert
        className="invisible pointer-events-none absolute flex w-max items-center gap-2"
      >
        {children}
      </div>
      {compact ? (
        <span className="truncate text-title-sm text-content-primary" title={title}>
          {title}
        </span>
      ) : (
        children
      )}
    </div>
  );
}
