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
import { backParentTarget, backParentTitleKey, flowBackParent } from './backParent';
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
    // Narrow: the header names the screen itself (a stacked detail its own name) and carries the
    // context notice, so a peer area needs no line in its body.
    return (
      <span className="grid min-w-0">
        <span className="truncate text-title-sm text-content-primary">{detailLabel ?? title}</span>
        {contextNotice ? (
          <span className="truncate text-body-sm text-content-secondary" role="status">
            {contextNotice}
          </span>
        ) : null}
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
                    className="block max-w-48"
                    title={identity}
                    aria-label={identity}
                    to="/specs/$specId"
                    params={{ specId }}
                    search={{ collection }}
                  >
                    {/* Truncated inside: the link's own box keeps its hit area unclipped. */}
                    <span className="block truncate">{identity}</span>
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

  return {
    collection,
    identity,
    contextNotice,
    parent,
  };
}

/**
 * The Narrow body Back of a flow page (a Create step, a new Session): "Back to <list>", the list
 * the flow was started from. Peer areas of a Specification (Overview, Sessions, Tasks, Documents,
 * Changes, Repository) never show one: they keep the navigation trigger, and the location trail
 * carries the way back on split layouts.
 */
export function FlowParentBack({
  specId,
  view,
}: {
  specId?: string;
  view: 'new-specification' | 'new-session';
}) {
  const { t } = useTranslation();
  const router = useRouter({ warn: false });
  const { supportsSplit } = useWorkspaceCapabilities();
  const collection = useApplicationCollection();
  if (
    !router?.state.matches.some((match) => match.routeId.startsWith('/_app/')) ||
    supportsSplit ||
    (view === 'new-session' && !specId)
  ) {
    return null;
  }

  const parent = flowBackParent(view);

  return (
    <FlowBack
      label={t('navigation.backTo', { parent: t(backParentTitleKey[parent]) })}
      link={backParentTarget(parent, specId, collection)}
    />
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

/** Router navigation options of a Back target (an address, so it can open in a new tab). */
export interface FlowBackTarget {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  hash?: string;
}

const flowBackButtonClassName = [
  'inline-flex min-w-0 items-center gap-1.5 text-content-secondary outline-none focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50',
  hitAreaClassName,
].join(' ');

function FlowBackContent({ children }: { children: ReactNode }) {
  return (
    // One flex row: the DS Link wraps its children in a label span, so the icon and text must
    // not rely on the anchor being the flex container.
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon name="arrow-right" size="sm" className="shrink-0 rotate-180" />
      <span>{children}</span>
    </span>
  );
}

/**
 * The one body Back control. Body backs exist only in flows (Create steps, a new Session, the
 * return to a Session from a document or the documentation); every other way back is the header
 * Back of a stacked screen or the location trail. It owns its look and has no outer spacing: it is
 * the first row of its region and takes that region's gap. Its label names the target
 * ("Back to <parent>") unless it is a flow step ("Change method").
 */
export function FlowBack({
  label,
  link,
  onBack,
  disabled,
}: {
  label: string;
  /** The target's address (a link: it can be opened in a new tab). */
  link?: FlowBackTarget;
  /** A local flow step without an address (a button). */
  onBack?: () => void;
  disabled?: boolean;
}) {
  return (
    <Typography as="div" variant="body-sm" data-flow-back="">
      {link ? (
        // The targets are router-typed where they are built (`backParentTarget`, a Session route).
        <BackLink {...(link as Parameters<typeof BackLink>[0])}>
          <FlowBackContent>{label}</FlowBackContent>
        </BackLink>
      ) : (
        <button
          type="button"
          className={flowBackButtonClassName}
          disabled={disabled}
          onClick={onBack}
        >
          <FlowBackContent>{label}</FlowBackContent>
        </button>
      )}
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
  sessionId,
  sessionTitle,
  collection,
}: {
  /** Callers still pass the Specification; the Session route is top-level and needs only its id. */
  specId?: string;
  sessionId: string;
  /** Names the Session when the caller knows its title ("Back to <title>", else "Back to Session"). */
  sessionTitle?: string;
  collection: 'current' | 'archive';
}) {
  const { t } = useTranslation();

  return (
    <FlowBack
      label={t('navigation.backTo', { parent: sessionTitle ?? t('managedSession.title') })}
      link={{ to: '/sessions/$sessionId', params: { sessionId }, search: { collection } }}
    />
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
