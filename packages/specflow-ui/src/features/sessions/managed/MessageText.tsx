import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@nevo/ui';
import type { ContentRef, TextPreview } from '@nevo/specflow-contracts/sessions';
import type { ManagedSessionsApi } from './api';

export function ReadableText({
  api,
  sessionId,
  value,
}: {
  api: ManagedSessionsApi;
  sessionId: string;
  value: TextPreview;
}) {
  // Loaded pages, pagination and in-flight reads all belong to one immutable revision.
  const identity = JSON.stringify([sessionId, value.content?.contentId, value.content?.revision]);
  return <RevisionText key={identity} api={api} sessionId={sessionId} value={value} />;
}

function RevisionText({
  api,
  sessionId,
  value,
}: {
  api: ManagedSessionsApi;
  sessionId: string;
  value: TextPreview;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState<{ text: string; offset: number; nextOffset?: number }>();
  const [previous, setPrevious] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const lifetime = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  async function load(offset: number, ref: ContentRef) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await api.content(sessionId, ref, offset, controller.signal);
      if (!controller.signal.aborted) setPage(result);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="grid min-w-0 gap-2">
      <p className="whitespace-pre-wrap break-words text-body-md">{page?.text ?? value.text}</p>
      {!value.complete && !page && (
        <p className="text-body-sm text-content-muted">{t('managedSession.partial')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!page && !value.complete && value.content && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void load(0, value.content)}
          >
            {t('managedSession.readMore')}
          </Button>
        )}
        {!!previous.length && value.content && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              const offset = previous.at(-1)!;
              setPrevious(previous.slice(0, -1));
              void load(offset, value.content!);
            }}
          >
            {t('managedSession.previous')}
          </Button>
        )}
        {page?.nextOffset !== undefined && value.content && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setPrevious([...previous, page.offset].slice(-256));
              void load(page.nextOffset!, value.content!);
            }}
          >
            {t('managedSession.next')}
          </Button>
        )}
        {failed && (
          <span role="alert" className="text-body-sm text-content-muted">
            {t('managedSession.failed')}
          </span>
        )}
      </div>
    </div>
  );
}
