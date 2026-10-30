import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AppContent,
  AppWorkspace,
  Button,
  Spinner,
  StatusIndicator,
  TextArea,
  Typography,
  WorkspaceHeader,
  useSecondaryNavigation,
  useWorkspaceCapabilities,
  cn,
} from '@nevo/ui';
import type { ConversationEntry, Interaction } from '@nevo/specflow-contracts/sessions';
import { createSessionFeed } from './feed';
import { ReadableText } from './MessageText';
import { createWorkInspector } from './WorkInspector';
import { SessionContext, createSessionContextStack } from './context/SessionContext';
import { unavailableSessionContext } from './context/sessionContextTypes';
import type { SessionContextViewModel } from './context/sessionContextTypes';
import { useWorkspaceLabels } from '../../../app/navigation/useWorkspaceLabels';
import type { ManagedSessionsApi } from './api';

function browserStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function InteractionPrompt({
  interaction,
  busy,
  onRespond,
}: {
  interaction: Interaction;
  busy: boolean;
  onRespond: (answer: string, optionId?: string, allow?: boolean) => void;
}) {
  const { t } = useTranslation();
  const [answer, setAnswer] = useState('');
  const unsupported = interaction.kind === 'question' && (interaction.maxSelections ?? 1) > 1;

  return (
    <section
      aria-label={t('managedSession.responseRequired')}
      className="grid max-h-[40dvh] gap-3 overflow-y-auto rounded-control border border-border-subtle p-4"
    >
      <Typography as="h2" variant="title-sm">
        {t('managedSession.responseRequired')}
      </Typography>
      <p className="whitespace-pre-wrap break-words text-body-sm">{interaction.prompt}</p>
      {unsupported ? (
        <Alert tone="attention" title={t('managedSession.unsupportedQuestion')} />
      ) : interaction.kind === 'permission' ? (
        <>
          <p className="break-words text-body-sm">{interaction.actionSummary}</p>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => onRespond('', undefined, true)}>
              {t('managedSession.allow')}
            </Button>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => onRespond('', undefined, false)}
            >
              {t('managedSession.deny')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {interaction.options?.map((option) => (
              <Button
                key={option.id}
                className="max-w-full whitespace-normal text-left"
                disabled={busy}
                variant="secondary"
                onClick={() => onRespond('', option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {interaction.allowText && (
            <>
              <label htmlFor="managed-answer" className="text-body-sm">
                {t('managedSession.answer')}
              </label>
              <TextArea
                id="managed-answer"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              />
              <Button disabled={busy || !answer.trim()} onClick={() => onRespond(answer)}>
                {t('managedSession.respond')}
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * One conversation entry, rendered per its semantic role (session-conversation-ui-spec.md §4-5).
 * V10 rule: do not prefix every entry with a repeated "Ty"/"Asystent" speaker label — the kind
 * stays available to assistive tech (`sr-only`) but visual role comes from alignment/surface/
 * typography/Markdown instead of a visible caption on every row.
 */
function EntryRow({
  entry,
  api,
  sessionId,
  outcomeLabels,
  onInspect,
}: {
  entry: ConversationEntry;
  api: ManagedSessionsApi;
  sessionId: string;
  outcomeLabels: Record<string, string>;
  onInspect: () => void;
}) {
  const { t } = useTranslation();
  const kindLabel = t(`managedSession.entry.${entry.kind}`);
  const srLabel = <span className="sr-only">{kindLabel}</span>;

  if (entry.kind === 'request') {
    return (
      <article data-entry-id={entry.id} className="grid justify-end">
        {srLabel}
        <div className="max-w-content-standard rounded-composite bg-surface-subtle px-4 py-3">
          <ReadableText api={api} sessionId={sessionId} value={entry.text} />
        </div>
      </article>
    );
  }

  if (entry.kind === 'answer') {
    return (
      <article data-entry-id={entry.id} className="grid min-w-0 gap-1">
        {srLabel}
        <ReadableText api={api} sessionId={sessionId} value={entry.text} markdown />
      </article>
    );
  }

  if (entry.kind === 'commentary') {
    return (
      <article data-entry-id={entry.id} className="grid min-w-0 gap-1 text-content-secondary">
        {srLabel}
        <ReadableText api={api} sessionId={sessionId} value={entry.text} />
      </article>
    );
  }

  if (entry.kind === 'work-summary') {
    return (
      <article data-entry-id={entry.id} className="grid min-w-0 gap-1 text-content-muted">
        {srLabel}
        <div className="flex flex-wrap items-center gap-2">
          <ReadableText api={api} sessionId={sessionId} value={entry.text} />
          <Button size="sm" variant="ghost" onClick={onInspect}>
            {t('managedSession.inspect')}
          </Button>
        </div>
      </article>
    );
  }

  // 'outcome': no celebratory chrome on completion; a quiet semantic marker on failure/cancel.
  const tone =
    entry.text.text === 'failed'
      ? 'danger'
      : entry.text.text === 'completed'
        ? undefined
        : 'neutral';

  return (
    <article
      data-entry-id={entry.id}
      className={cn(
        'grid min-w-0 gap-1',
        entry.text.text === 'failed' ? 'text-content-error' : 'text-content-secondary',
      )}
    >
      {srLabel}
      <div className="flex flex-wrap items-center gap-2">
        {tone && <StatusIndicator tone={tone} aria-label={kindLabel} decorative={false} />}
        <ReadableText
          api={api}
          sessionId={sessionId}
          value={{ ...entry.text, text: outcomeLabels[entry.text.text] ?? entry.text.text }}
        />
        <Button size="sm" variant="ghost" onClick={onInspect}>
          {t('managedSession.inspect')}
        </Button>
      </div>
    </article>
  );
}

export function ManagedSession({
  sessionId,
  owner,
  api,
  sessionContext = unavailableSessionContext,
}: {
  sessionId: string;
  owner: string;
  api: ManagedSessionsApi;
  /**
   * Context Secondary content (full-session-screen-structure.md §7). Optional because the real
   * managed-Sessions contract has no Specification/Task association projection yet: the default
   * is an honest "unavailable" Context, not a fabricated empty one. Callers with a real/mock
   * projection (Storybook fixtures today) pass it explicitly.
   */
  sessionContext?: SessionContextViewModel;
}) {
  const { t } = useTranslation();
  const { supportsSplit } = useWorkspaceCapabilities();
  const [contextOpen, setContextOpen] = useState(true);
  const feed = useMemo(
    () => createSessionFeed(api, sessionId, owner, browserStorage()),
    [api, sessionId, owner],
  );
  const state = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
  useEffect(() => {
    feed.connect();

    return () => feed.disconnect();
  }, [feed]);
  const scroller = useRef<HTMLDivElement>(null),
    anchor = useRef<{ height: number; top: number } | undefined>(undefined);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) {
      return;
    }

    if (anchor.current) {
      node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height;
      anchor.current = undefined;
    } else if (!state.away) {
      node.scrollTop = node.scrollHeight;
    }
  }, [state.snapshot?.entries, state.away]);
  const navigation = useSecondaryNavigation(),
    labels = useWorkspaceLabels();
  const workStack = useMemo(() => createWorkInspector(api, feed, owner), [api, feed, owner]);
  function older() {
    if (scroller.current) {
      anchor.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
    }

    void feed.older();
  }

  const snapshot = state.snapshot;
  const outcomeLabels: Record<string, string> = {
    completed: t('managedSession.outcome.completed'),
    failed: t('managedSession.outcome.failed'),
    cancelled: t('managedSession.outcome.cancelled'),
    interrupted: t('managedSession.outcome.interrupted'),
  };

  return (
    <AppWorkspace scroll="content" fit="available" split="primary" labels={labels}>
      <AppWorkspace.Primary
        header={
          <WorkspaceHeader
            title={snapshot?.session.title ?? t('managedSession.title')}
            actions={
              !supportsSplit
                ? [
                    {
                      id: 'context',
                      label: t('sessions.context.title'),
                      icon: 'file',
                      onPress: () =>
                        void navigation.open(
                          createSessionContextStack(sessionId, sessionContext),
                          {},
                        ),
                    },
                  ]
                : !contextOpen
                  ? [
                      {
                        id: 'context',
                        label: t('sessions.context.title'),
                        icon: 'file',
                        onPress: () => setContextOpen(true),
                      },
                    ]
                  : undefined
            }
          />
        }
      >
        <AppContent className="flex h-full min-h-0 w-full flex-col">
          {!snapshot ? (
            <div className="grid gap-3 p-5">
              <p role="status">
                {t(
                  state.connection === 'error' ? 'managedSession.failed' : 'managedSession.loading',
                )}
              </p>
              {state.connection === 'error' && (
                <Button onClick={() => feed.connect()}>{t('common.retry')}</Button>
              )}
            </div>
          ) : (
            <>
              {snapshot.session.readiness === 'authenticationRequired' && (
                <Alert tone="attention" title={t('managedSession.authenticationRequired')}>
                  <p>{t('managedSession.authenticationHelp')}</p>
                  <Button disabled={state.commandBusy} onClick={() => void feed.recheckProvider()}>
                    {t('managedSession.recheckAuthentication')}
                  </Button>
                </Alert>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-3">
                <p className="text-body-sm text-content-muted">
                  {snapshot.session.providerId === 'mock'
                    ? t('managedSession.mockNote')
                    : snapshot.session.providerId}
                </p>
                <span role="status" className="flex items-center gap-1.5 text-body-sm">
                  {state.connection === 'connected' &&
                    snapshot.currentActivity?.kind === 'waiting' && <Spinner size="sm" />}
                  {state.connection === 'connected'
                    ? (snapshot.currentActivity?.label ??
                      t(`managedSession.${snapshot.session.readiness}`))
                    : t(`managedSession.${state.connection}`)}
                </span>
                {state.connection === 'error' && (
                  <Button size="sm" onClick={() => feed.connect()}>
                    {t('common.retry')}
                  </Button>
                )}
              </div>
              <div
                ref={scroller}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                onScroll={(event) => {
                  const node = event.currentTarget;
                  feed.setAway(node.scrollHeight - node.scrollTop - node.clientHeight > 80);
                }}
              >
                <div className="mx-auto grid w-full max-w-content-standard gap-5 px-5 py-5">
                  {snapshot.history.hasOlder && (
                    <Button disabled={state.historyBusy} variant="ghost" onClick={older}>
                      {t('managedSession.older')}
                    </Button>
                  )}
                  {state.historyError && (
                    <Alert tone="attention" title={t('managedSession.historyFailed')}>
                      <Button size="sm" onClick={older}>
                        {t('common.retry')}
                      </Button>
                    </Alert>
                  )}
                  {!snapshot.entries.length && (
                    <p className="py-8 text-body-md text-content-muted">
                      {t('managedSession.empty')}
                    </p>
                  )}
                  {snapshot.entries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      api={api}
                      sessionId={sessionId}
                      outcomeLabels={outcomeLabels}
                      onInspect={() =>
                        void navigation.open(workStack, { sessionId, turnId: entry.turnId })
                      }
                    />
                  ))}
                </div>
              </div>
              {(state.hasNew || state.away) && (
                <Button variant="ghost" onClick={() => feed.latest()}>
                  {t('managedSession.latest')}
                </Button>
              )}
              <div className="mx-auto grid w-full max-w-content-standard shrink-0 gap-3 p-5">
                {snapshot.interaction && (
                  <InteractionPrompt
                    key={snapshot.interaction.interactionId}
                    interaction={snapshot.interaction}
                    busy={state.commandBusy || !snapshot.session.capabilities.manage}
                    onRespond={(answer, optionId, allow) => {
                      const i = snapshot.interaction!;
                      void feed.respond(
                        i.interactionId,
                        i.kind === 'permission'
                          ? {
                              requestId: crypto.randomUUID(),
                              kind: 'permission',
                              decision: allow ? 'allow' : 'deny',
                            }
                          : {
                              requestId: crypto.randomUUID(),
                              kind: 'question',
                              answer: {
                                optionIds: optionId ? [optionId] : [],
                                ...(answer ? { text: answer } : {}),
                              },
                            },
                      );
                    }}
                  />
                )}
                {state.commandError && (
                  <Alert tone="attention" title={t('managedSession.commandFailed')} />
                )}
                <label htmlFor="managed-message" className="text-body-sm">
                  {t('managedSession.message')}
                </label>
                <TextArea
                  id="managed-message"
                  rows={3}
                  value={state.draft}
                  onChange={(event) => feed.setDraft(event.target.value)}
                  disabled={!!state.pending || snapshot.session.readiness === 'unavailable'}
                />
                <div className="flex flex-wrap justify-end gap-2">
                  {snapshot.session.capabilities.cancel && (
                    <Button
                      variant="secondary"
                      disabled={state.commandBusy}
                      onClick={() => void feed.cancel()}
                    >
                      {t('managedSession.cancel')}
                    </Button>
                  )}
                  <Button
                    disabled={
                      state.commandBusy ||
                      (!state.pending && !snapshot.session.capabilities.start) ||
                      (!state.pending && !state.draft.trim())
                    }
                    onClick={() => void feed.send()}
                  >
                    {t(state.pending ? 'managedSession.retrySend' : 'managedSession.send')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </AppContent>
      </AppWorkspace.Primary>
      {/* Context is the default split-capable Secondary (full-session-screen-structure.md §3.1,
          §3.4): open by default, stays closed once the user explicitly closes it, and is restored
          by the Primary "Context" action — on narrow layouts it opens the Context Secondary stack;
          on split-capable layouts it reappears whenever Context is closed, so there is always a
          way back in regardless of `supportsSplit` (§24.2). */}
      <AppWorkspace.Secondary
        open={contextOpen}
        onOpenChange={setContextOpen}
        header={<WorkspaceHeader title={t('sessions.context.title')} />}
      >
        <SessionContext sessionId={sessionId} value={sessionContext} />
      </AppWorkspace.Secondary>
    </AppWorkspace>
  );
}
