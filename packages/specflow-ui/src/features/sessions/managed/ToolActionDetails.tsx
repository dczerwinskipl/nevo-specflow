import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import type { ContentRef, ToolActionSummary } from '@nevo/specflow-contracts/sessions';
import { Alert, Button, Spinner, Timeline, Typography } from '@nevo/ui';
import type { ManagedSessionsApi } from './api';
import { historyEntry } from './pagedHistoryAnchor';
import { ToolActionHeader } from './ToolActionHeader';
import { ToolDetailCode } from './ToolDetailCode';
import { workStateTone } from './workStatus';

interface ContentSource {
  api: ManagedSessionsApi;
  sessionId: string;
}

/** Upper bound on how much of one parameters/response body is loaded for display. */
const MAX_DETAIL_PAGES = 32;

/** The full text behind a ToolAction `ContentRef`, page by page (`ContentPage.nextOffset`). */
function useContentText(source: ContentSource, ref: ContentRef) {
  return useQuery({
    queryKey: ['managed-content', source.sessionId, ref.contentId, ref.revision],
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      let text = '';
      let offset = 0;
      for (let page = 0; page < MAX_DETAIL_PAGES; page += 1) {
        const result = await source.api.content(source.sessionId, ref, offset, signal);
        text += result.text;
        if (result.complete || result.nextOffset === undefined) {
          return { text, truncated: false };
        }

        offset = result.nextOffset;
      }

      return { text, truncated: true };
    },
  });
}

/** What a body is, decided only from its own text — never guessed beyond "is this JSON". There is no
 * per-tool schema in the contract (`ToolActionSummary.input`/`output` are opaque `ContentRef`s),
 * so no field is singled out or re-labelled, and no tool-specific structure (e.g. search matches
 * grouped by file) is inferred from arbitrary stdout: valid JSON is pretty-printed as JSON,
 * anything else (a shell command, stdout, prose) is shown verbatim with its whitespace intact. */
export type DetailShape = { kind: 'json'; pretty: string } | { kind: 'text'; text: string };

export function detailShape(text: string): DetailShape {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { kind: 'json', pretty: JSON.stringify(JSON.parse(trimmed), null, 2) };
    } catch {
      // Not JSON after all: shown verbatim below.
    }
  }

  return { kind: 'text', text };
}

function CopyTextButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <>
      <Button
        aria-label={label}
        leadingIcon={copied ? Check : Copy}
        size="sm"
        variant="ghost"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(
            () => {
              clearTimeout(timer.current);
              setCopied(true);
              timer.current = setTimeout(() => setCopied(false), 2000);
            },
            () => setCopied(false),
          );
        }}
      >
        {copied ? t('managedSession.copy.copied') : t('managedSession.workInspector.copy')}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t('managedSession.copy.copied') : ''}
      </span>
    </>
  );
}

/** One labelled section of a ToolAction: the parameters it was called with, or the tool's own
 * response. Copy always copies the ORIGINAL text, never the reformatted presentation. */
function ToolActionDetailSection({
  label,
  copyLabel,
  value,
  source,
}: {
  label: string;
  copyLabel: string;
  value: ContentRef;
  source: ContentSource;
}) {
  const { t } = useTranslation();
  const content = useContentText(source, value);
  const shape = content.data ? detailShape(content.data.text) : undefined;

  return (
    <section className="grid min-w-0 gap-1.5">
      {/* The heading and its Copy action share one row — two different things, so at opposite
          ends; the content gets its own code surface below. The heading is the DS section-title
          role (`section-label`), the exact treatment Session Context uses for its own section
          headings ("SPECYFIKACJA", "AKTUALNE WYKONANIE") — not a fourth, ad-hoc label style. */}
      <div className="flex min-h-control-height-compact min-w-0 items-center justify-between gap-2">
        <Typography as="h3" variant="section-label">
          {label}
        </Typography>
        {content.data && <CopyTextButton text={content.data.text} label={copyLabel} />}
      </div>
      {content.isPending && <Spinner size="sm" />}
      {content.isError && (
        <Typography as="p" variant="body-sm" className="text-content-muted">
          {t('managedSession.failed')}
        </Typography>
      )}
      {/* Numbered only when the lines are ours (pretty-printed JSON); verbatim text keeps exactly
          its own lines, including any numbering the tool printed (`cat -n`). */}
      {shape?.kind === 'json' && (
        <ToolDetailCode text={shape.pretty} language="json" label={label} lineNumbers />
      )}
      {shape?.kind === 'text' && (
        <ToolDetailCode text={shape.text} language="plain" label={label} lineNumbers={false} />
      )}
      {content.data?.truncated && (
        <Typography as="p" variant="body-sm" className="text-content-muted">
          {t('managedSession.workInspector.detailTruncated')}
        </Typography>
      )}
    </section>
  );
}

/**
 * L4: one ToolAction's own content, one simple structured layout rather than raw text: header (`ToolActionHeader`: the full title, then a status line
 * with a discreet status mark and the duration; in a split Secondary the single-action screen
 * declares it as its `detailHeader`, outside this content), the parameters, the tool's response — each under
 * a label + Copy row on its own code surface (formatted JSON when the body is JSON, verbatim text
 * otherwise), height-capped with its own scroll — and an error as its own alert with message and
 * code. No extra cards, labels or separators around them.
 *
 * Deliberately NOT a `Timeline.Item`/`Timeline.Marker` itself — see `ToolActionTimelineItem` (the
 * multi-item case) vs. `SingleToolActionDetail` (this content rendered flush, no marker gutter)
 * below for why the two cases use a different wrapper.
 */
function ToolActionContent({
  item,
  source,
  withHeader,
  asHeading = false,
}: {
  item: ToolActionSummary;
  source: ContentSource;
  /** Render the header (`ToolActionHeader`) as the first part of the content. */
  withHeader: boolean;
  /** The single-action screen's own heading (no parent Work title above it). */
  asHeading?: boolean;
}) {
  const { t } = useTranslation();
  const failed = workStateTone(item.state) === 'danger';

  return (
    // `gap-5`: the screen's section rhythm (20px) between the header, the parameters and the
    // response — the sections read as separate blocks, not one stack of captions.
    <div className="grid min-w-0 gap-5">
      {withHeader && <ToolActionHeader item={item} asHeading={asHeading} />}
      {item.input && (
        <ToolActionDetailSection
          label={t('managedSession.workInspector.input')}
          copyLabel={t('managedSession.workInspector.copyInput')}
          value={item.input}
          source={source}
        />
      )}
      {item.output && (
        <ToolActionDetailSection
          label={t('managedSession.workInspector.output')}
          copyLabel={t('managedSession.workInspector.copyOutput')}
          value={item.output}
          source={source}
        />
      )}
      {item.error && (
        <Alert tone={failed ? 'danger' : 'attention'} title={item.error.message}>
          {/* Labelled, not a bare technical code as the primary visible text (a raw `process_exit`
              reads as unexplained noise right under the message) — the code is secondary metadata, smaller and muted, not styled like a
              second line of the message itself. */}
          <Typography as="span" variant="body-sm" className="text-content-muted">
            {t('managedSession.workInspector.errorCode', { code: item.error.code })}
          </Typography>
        </Alert>
      )}
    </div>
  );
}

/** A Work with several ToolActions lists each one separately — never one merged, fictional
 * response. The shared Timeline marker rail has a real job here: it is the only thing telling the
 * user these are N distinct, individually-timestamped steps rather than one block of detail, so
 * the indent it reserves is load-bearing. */
export function ToolActionTimelineItem({
  item,
  source,
}: {
  item: ToolActionSummary;
  source: ContentSource;
}) {
  return (
    <Timeline.Item {...historyEntry(item.actionId)}>
      <Timeline.Marker active={item.state === 'active'} tone={workStateTone(item.state)} />
      <Timeline.Content title={<ToolActionContent item={item} source={source} withHeader />} />
    </Timeline.Item>
  );
}

/**
 * The single-action screen's header: the action's full title as the screen heading and its status
 * line. Declared as the `actions` screen's `detailHeader`, so a split Secondary shows it beside Back
 * in the non-scrolling detail header row, not inside the scrolling content.
 */
export function SingleToolActionHeader({ item }: { item: ToolActionSummary }) {
  return <ToolActionHeader item={item} asHeading />;
}

/**
 * A Work with exactly ONE ToolAction (the common case — most tool calls are a single action) gets
 * no Timeline/marker rail at all: with nothing else on the rail to align against, the reserved
 * 1.25rem+gap-x-3 marker column (`TimelineItem`'s own `size="md"` grid) was pure unexplained
 * indent, misaligning "PARAMETRY"/"ODPOWIEDŹ NARZĘDZIA" and their code blocks against the page's
 * own header and the parent Work title above them. This renders the
 * identical content flush at the panel's own padding edge instead. */
export function SingleToolActionDetail({
  item,
  source,
  withHeader,
}: {
  item: ToolActionSummary;
  source: ContentSource;
  /**
   * Heads the content with the action's header (as the screen's heading). False when the workspace
   * already shows it in the detail header row (`SingleToolActionHeader`, `detailHeader`).
   */
  withHeader: boolean;
}) {
  return <ToolActionContent item={item} source={source} withHeader={withHeader} asHeading />;
}
