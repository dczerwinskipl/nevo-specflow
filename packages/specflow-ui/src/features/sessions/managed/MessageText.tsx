import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, MarkdownDocument, Spinner } from '@nevo/ui';
import type { ContentRef, TextPreview } from '@nevo/specflow-contracts/sessions';
import { useMarkdownLabels } from '../../../i18n/useMarkdownLabels';
import type { ManagedSessionsApi } from './api';

/** Imperative handle exposed by {@link ReadableText}: the one owner of the message's fully
 * resolved text (initial preview plus every auto-stitched page), for actions that need the whole
 * authored message rather than just the capped initial preview — e.g. the Copy message action in
 * `ManagedSession`'s `EntryRow` (session-chat-v10-design.md §2). */
export interface ReadableTextHandle {
  /** Writes the full resolved text to the clipboard. Resolves to whether it succeeded. */
  copy: () => Promise<boolean>;
}

export const ReadableText = forwardRef<
  ReadableTextHandle,
  {
    api: ManagedSessionsApi;
    sessionId: string;
    value: TextPreview;
    /** Session Chat V10: the agent's final answer is borderless-first Markdown, not plain text. */
    markdown?: boolean;
  }
>(function ReadableText({ api, sessionId, value, markdown = false }, ref) {
  // Loaded pages, pagination and in-flight reads all belong to one immutable revision.
  const identity = JSON.stringify([sessionId, value.content?.contentId, value.content?.revision]);

  return (
    <RevisionText
      key={identity}
      ref={ref}
      api={api}
      sessionId={sessionId}
      value={value}
      markdown={markdown}
    />
  );
});

/**
 * A `TextPreview` with `complete: false` is a transport limit (the initial preview is capped,
 * per the real API, to a couple of KiB), not something to surface to the user: it is not the
 * agent choosing to paginate its answer. So this stitches every remaining page into one
 * continuous string and renders the full answer as a single block — no "previous/next/read
 * more" controls. Fetching is sequential (each page's `nextOffset` drives the next request,
 * per the ContentPage contract) and progressive: each page is appended to the rendered text as
 * it arrives, so a long answer grows in place instead of leaving the user looking at nothing
 * while every page loads.
 */
const RevisionText = forwardRef<
  ReadableTextHandle,
  {
    api: ManagedSessionsApi;
    sessionId: string;
    value: TextPreview;
    markdown: boolean;
  }
>(function RevisionText({ api, sessionId, value, markdown }, ref) {
  const { t } = useTranslation();
  const markdownLabels = useMarkdownLabels();
  // Text fetched beyond the initial preview, appended page by page as the auto-fetch progresses.
  const [rest, setRest] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const lifetime = useRef<AbortController | undefined>(undefined);
  // The offset the fetch sequence last attempted; a retry resumes there instead of from scratch.
  const resumeFrom = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;

    return () => controller.abort();
  }, []);

  async function fetchRest(ref: ContentRef) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted) {
      return;
    }

    setBusy(true);
    setFailed(false);
    try {
      let offset: number | undefined = resumeFrom.current;
      while (offset !== undefined) {
        resumeFrom.current = offset;
        const result = await api.content(sessionId, ref, offset, controller.signal);
        if (controller.signal.aborted) {
          return;
        }

        setRest((text) => text + result.text);
        offset = result.nextOffset;
      }
    } catch {
      if (!controller.signal.aborted) {
        setFailed(true);
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    if (!value.complete && value.content) {
      void fetchRest(value.content);
    }
    // One automatic fetch sequence per revision: `ReadableText` remounts this component (via its
    // `key`) whenever sessionId/contentId/revision changes, so there is nothing else to react to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const text = value.text + rest;
  // The Copy message action (session-chat-v10-design.md §2) acts on this exact resolved text —
  // whatever has been stitched in so far — not the capped initial preview alone. Recreated
  // whenever `text` grows so a copy started mid-fetch still gets the latest available content.
  useImperativeHandle(
    ref,
    () => ({
      copy: async () => {
        try {
          // `navigator.clipboard` is missing outside secure contexts and may be refused: say so
          // instead of reporting a copy that did not happen (same convention as
          // `CreateFailurePanel`/`TaskDetailDisclosure`'s own copy actions).
          if (!navigator.clipboard?.writeText) {
            throw new Error('Clipboard is unavailable');
          }

          await navigator.clipboard.writeText(text);

          return true;
        } catch {
          return false;
        }
      },
    }),
    [text],
  );

  return (
    <div className="grid min-w-0 gap-2">
      {markdown ? (
        <MarkdownDocument source={text} labels={markdownLabels} headingOffset={1} />
      ) : (
        <p className="whitespace-pre-wrap break-words text-body-md">{text}</p>
      )}
      {(busy || failed) && (
        <span className="flex flex-wrap items-center gap-2">
          {busy && <Spinner size="sm" label={t('common.loading')} />}
          {failed && (
            <>
              <span role="alert" className="text-body-sm text-content-muted">
                {t('managedSession.failed')}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (value.content) {
                    void fetchRest(value.content);
                  }
                }}
              >
                {t('common.retry')}
              </Button>
            </>
          )}
        </span>
      )}
    </div>
  );
});
