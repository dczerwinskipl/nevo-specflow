import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AppContent,
  AppWorkspaceBody,
  Button,
  Typography,
  defineSecondaryStack,
  useSecondaryStack,
} from '@nevo/ui';
import { translateNow } from '../../../i18n/message';
import type { ManagedSessionsApi } from './api';
import type { SessionFeed } from './feed';
import { ReadableText } from './MessageText';

interface Root {
  sessionId: string;
  turnId: string;
}
type Data = Root & { api: ManagedSessionsApi; feed: SessionFeed; owner: string };
interface Pages {
  work: Record<string, never>;
  actions: { workId: string };
}
function useWorkRefresh(feed: SessionFeed, turnId: string, refresh: () => Promise<unknown>) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = feed.subscribeWork((changed) => {
      if (changed !== turnId || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 300);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [feed, turnId, refresh]);
}
function Work({ data }: { data: Data }) {
  const { t } = useTranslation(),
    navigation = useSecondaryStack<Pages>();
  const [before, setBefore] = useState<string>(),
    [previous, setPrevious] = useState<(string | undefined)[]>([]);
  const query = useQuery({
    queryKey: ['managed-work', data.owner, data.sessionId, data.turnId, before],
    queryFn: ({ signal }) => data.api.work(data.sessionId, data.turnId, before, signal),
  });
  useWorkRefresh(data.feed, data.turnId, query.refetch);
  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area">
        <div className="grid gap-4">
          {query.isPending && <p role="status">{t('managedSession.loading')}</p>}
          {query.isError && (
            <Alert tone="attention" title={t('managedSession.failed')}>
              <Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>
            </Alert>
          )}
          {query.data?.items.map((item) => (
            <section key={item.workId} className="grid gap-2">
              <Typography variant="label-sm">
                {t(`managedSession.workKind.${item.kind}`)} ·{' '}
                {t(`managedSession.workState.${item.state}`)}
              </Typography>
              <ReadableText api={data.api} sessionId={data.sessionId} value={item.title} />
              {item.content && (
                <ReadableText
                  api={data.api}
                  sessionId={data.sessionId}
                  value={{ text: '', complete: false, content: item.content }}
                />
              )}
              {!!item.actionCount && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void navigation.navTo('actions', { workId: item.workId })}
                >
                  {t('managedSession.actions')}
                </Button>
              )}
            </section>
          ))}
          <div className="flex gap-2">
            {!!previous.length && (
              <Button
                variant="ghost"
                onClick={() => {
                  setBefore(previous.at(-1));
                  setPrevious(previous.slice(0, -1));
                }}
              >
                {t('managedSession.newer')}
              </Button>
            )}
            {query.data?.history.before && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPrevious([...previous, before].slice(-256));
                  setBefore(query.data.history.before);
                }}
              >
                {t('managedSession.older')}
              </Button>
            )}
          </div>
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}
function Actions({ data, params }: { data: Data; params: { workId: string } }) {
  const { t } = useTranslation();
  const [before, setBefore] = useState<string>();
  const query = useQuery({
    queryKey: ['managed-actions', data.owner, data.sessionId, params.workId, before],
    queryFn: ({ signal }) => data.api.actions(data.sessionId, params.workId, before, signal),
  });
  useWorkRefresh(data.feed, data.turnId, query.refetch);
  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area">
        <div className="grid gap-4">
          {query.isPending && <p role="status">{t('managedSession.loading')}</p>}
          {query.isError && (
            <Alert tone="attention" title={t('managedSession.failed')}>
              <Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>
            </Alert>
          )}
          {query.data?.items.map((item) => (
            <section key={item.actionId} className="grid gap-2">
              <Typography variant="label-sm">
                {t(`managedSession.workState.${item.state}`)}
              </Typography>
              <ReadableText api={data.api} sessionId={data.sessionId} value={item.title} />
              {item.input && (
                <ReadableText
                  api={data.api}
                  sessionId={data.sessionId}
                  value={{ text: '', complete: false, content: item.input }}
                />
              )}
              {item.output && (
                <ReadableText
                  api={data.api}
                  sessionId={data.sessionId}
                  value={{ text: '', complete: false, content: item.output }}
                />
              )}
            </section>
          ))}
          {query.data?.history.before && (
            <Button variant="ghost" onClick={() => setBefore(query.data.history.before)}>
              {t('managedSession.older')}
            </Button>
          )}
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}
export function createWorkInspector(api: ManagedSessionsApi, feed: SessionFeed, owner: string) {
  return defineSecondaryStack<Root, Data, Pages>({
    id: 'managed-session-work',
    initial: 'work',
    useData: (params) => ({ status: 'ready', data: { ...params, api, feed, owner } }),
    screens: {
      work: {
        get title() {
          return translateNow('managedSession.work');
        },
        component: Work,
      },
      actions: {
        get title() {
          return translateNow('managedSession.actions');
        },
        component: Actions,
      },
    },
  });
}
