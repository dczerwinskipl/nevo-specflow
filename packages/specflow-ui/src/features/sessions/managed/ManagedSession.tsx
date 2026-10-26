import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AppContent,
  AppWorkspace,
  Button,
  TextArea,
  Typography,
  WorkspaceHeader,
  useSecondaryNavigation,
} from '@nevo/ui';
import type { Interaction } from '@nevo/specflow-contracts/sessions';
import { createSessionFeed } from './feed';
import { ReadableText } from './MessageText';
import { createWorkInspector } from './WorkInspector';
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
export function ManagedSession({
  sessionId,
  owner,
  api,
}: {
  sessionId: string;
  owner: string;
  api: ManagedSessionsApi;
}) {
  const { t } = useTranslation();
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
    if (!node) return;
    if (anchor.current) {
      node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height;
      anchor.current = undefined;
    } else if (!state.away) node.scrollTop = node.scrollHeight;
  }, [state.snapshot?.entries, state.away]);
  const navigation = useSecondaryNavigation(),
    labels = useWorkspaceLabels();
  const workStack = useMemo(() => createWorkInspector(api, feed, owner), [api, feed, owner]);
  function older() {
    if (scroller.current)
      anchor.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
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
        header={<WorkspaceHeader title={snapshot?.session.title ?? t('managedSession.title')} />}
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
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-3">
                <p className="text-body-sm text-content-muted">
                  {snapshot.session.providerId === 'mock'
                    ? t('managedSession.mockNote')
                    : snapshot.session.providerId}
                </p>
                <span role="status" className="text-body-sm">
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
                    <article key={entry.id} data-entry-id={entry.id} className="grid min-w-0 gap-2">
                      <Typography variant="label-sm" className="text-content-muted">
                        {t(`managedSession.entry.${entry.kind}`)}
                      </Typography>
                      <ReadableText
                        key={entry.text.content?.contentId ?? entry.id}
                        api={api}
                        sessionId={sessionId}
                        value={
                          entry.kind === 'outcome'
                            ? {
                                ...entry.text,
                                text: outcomeLabels[entry.text.text] ?? entry.text.text,
                              }
                            : entry.text
                        }
                      />
                      {(entry.kind === 'work-summary' || entry.kind === 'outcome') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void navigation.open(workStack, { sessionId, turnId: entry.turnId })
                          }
                        >
                          {t('managedSession.inspect')}
                        </Button>
                      )}
                    </article>
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
                  disabled={!!state.pending}
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
    </AppWorkspace>
  );
}
