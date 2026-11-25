import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Check, Copy, WrapText } from 'lucide-react';
import type { ContentRef, ToolActionSummary } from '@nevo/specflow-contracts/sessions';
import {
  Alert,
  Button,
  Collapsible,
  Spinner,
  Timeline,
  Typography,
  useWorkspaceCapabilities,
} from '@nevo/ui';
import type { ManagedSessionsApi } from './api';
import { historyEntry } from './pagedHistoryAnchor';
import { ToolActionHeader } from './ToolActionHeader';
import { ToolDetailCode } from './ToolDetailCode';
import { workStateTone } from './workStatus';
import { useCodeWrapPreference } from './codeWrapPreference';
import type { CodeLanguage } from '../../../shared/code-view';
import { copyText } from '../../../shared/clipboard/copyText';

interface ContentSource {
  api: ManagedSessionsApi;
  sessionId: string;
}

/** Upper bound on how much of one parameters/response body is loaded for display. */
const MAX_DETAIL_PAGES = 32;

/** The full text behind a ToolAction `ContentRef`, page by page (`ContentPage.nextOffset`). */
function useContentText(source: ContentSource, ref: ContentRef | undefined) {
  return useQuery({
    queryKey: ['managed-content', source.sessionId, ref?.contentId, ref?.revision],
    staleTime: Infinity,
    enabled: ref !== undefined,
    queryFn: async ({ signal }) => {
      if (!ref) {
        return { text: '', truncated: false };
      }

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
        title={label}
        leadingIcon={copied ? Check : Copy}
        size="sm"
        variant="ghost"
        onClick={() => {
          void copyText(text).then((done) => {
            clearTimeout(timer.current);
            setCopied(done);
            if (done) {
              timer.current = setTimeout(() => setCopied(false), 2000);
            }
          });
        }}
      >
        <ResponsiveLabel>
          {copied ? t('managedSession.copy.copied') : t('managedSession.workInspector.copy')}
        </ResponsiveLabel>
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t('managedSession.copy.copied') : ''}
      </span>
    </>
  );
}

/**
 * A code header action's words: beside its icon where the shell can split (desktop), an
 * icon-only button where it cannot (a phone, `useWorkspaceCapabilities`, the signal the Composer's
 * pickers use), the words kept as its accessible name and tooltip.
 */
function ResponsiveLabel({ children }: { children: string }) {
  const { supportsSplit, measured } = useWorkspaceCapabilities();

  return measured && !supportsSplit ? <span className="sr-only">{children}</span> : children;
}

/**
 * "Wrap lines" for every code block of the screen: one toggle in the screen's header, since the
 * choice is one for all blocks and remembered (owner, 2026-11-25: a toggle on each block that
 * changed all of them read as broken). Each block keeps only its own Copy.
 */
export function WrapLinesToggle() {
  const { t } = useTranslation();
  const [wrap, setWrap] = useCodeWrapPreference();
  const label = t('managedSession.workInspector.wrapLines');

  return (
    <Button
      aria-pressed={wrap}
      title={label}
      leadingIcon={WrapText}
      size="sm"
      variant={wrap ? 'secondary' : 'ghost'}
      onClick={() => setWrap(!wrap)}
      data-wrap-lines=""
    >
      <ResponsiveLabel>{label}</ResponsiveLabel>
    </Button>
  );
}

/** One labelled code block of a ToolAction: its label, then Copy (the original text, never a
 * reformatted presentation), then the text on the product's code view. Wrap lines is the screen's
 * (`WrapLinesToggle`). */
function CodeSection({
  label,
  copyLabel,
  text,
  copy = text,
  language,
  lineNumbers,
  heading = true,
}: {
  label: string;
  copyLabel: string;
  text: string;
  /** What Copy copies, when it differs from what is shown (the raw JSON of pretty parameters). */
  copy?: string;
  language: CodeLanguage;
  lineNumbers: boolean;
  /** False inside a disclosure that already names the block. */
  heading?: boolean;
}) {
  const [wrap] = useCodeWrapPreference();

  return (
    <section className="grid min-w-0 gap-1.5" aria-label={heading ? undefined : label}>
      {/* The heading and its actions share one row — two different things, so at opposite ends;
          the content gets its own code surface below. The heading is the DS section-title role
          (`section-label`), the exact treatment Session Context uses for its own headings. */}
      <div className="flex min-h-control-height-compact min-w-0 flex-wrap items-center justify-between gap-2">
        {heading ? (
          <Typography as="h3" variant="section-label">
            {label}
          </Typography>
        ) : (
          <span />
        )}
        <CopyTextButton text={copy} label={copyLabel} />
      </div>
      <ToolDetailCode
        text={text}
        language={language}
        label={label}
        lineNumbers={lineNumbers}
        wrap={wrap}
      />
    </section>
  );
}

/** The loading, failure and truncation states of a body read from a ContentRef. */
function ContentState({ content }: { content: ReturnType<typeof useContentText> }) {
  const { t } = useTranslation();

  return (
    <>
      {content.isPending && content.fetchStatus !== 'idle' && <Spinner size="sm" />}
      {content.isError && (
        <Typography as="p" variant="body-sm" className="text-content-muted">
          {t('managedSession.failed')}
        </Typography>
      )}
      {content.data?.truncated && (
        <Typography as="p" variant="body-sm" className="text-content-muted">
          {t('managedSession.workInspector.detailTruncated')}
        </Typography>
      )}
    </>
  );
}

type Parameters = Record<string, unknown>;
const textOf = (value: unknown) => (typeof value === 'string' ? value : undefined);
const slashes = (value: string) => value.split('\\').join('/');

/** The input as an object, when it is a JSON object. */
function parameters(text: string | undefined): Parameters | undefined {
  if (!text) {
    return undefined;
  }

  try {
    const value: unknown = JSON.parse(text);

    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Parameters)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The workspace root a file tool's absolute path reveals: its `file_path` minus the Runtime's
 * workspace-relative `subject`. Used only to show the tool's response with relative paths.
 */
export function workspaceRootOf(
  params: Parameters | undefined,
  subject: string | undefined,
): string | undefined {
  const path = textOf(params?.file_path);
  if (!path || !subject || subject.startsWith('…')) {
    return undefined;
  }

  const normalized = slashes(path);
  const relative = slashes(subject);

  return normalized.endsWith('/' + relative)
    ? normalized.slice(0, -(relative.length + 1))
    : undefined;
}

/** `text` with every path under `root` written relative to it, whichever separators it uses. */
export function relativeTo(text: string, root: string | undefined): string {
  if (!root) {
    return text;
  }

  const separator = String.raw`[\\/]`;
  const pattern = root
    .split('/')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))
    .join(separator);

  // A path under the root loses it; the root itself reads as `.`.
  return text.replace(
    new RegExp(pattern + separator + '?', /^[A-Za-z]:/.test(root) ? 'gi' : 'g'),
    (match) => (/[\\/]$/.test(match) ? '' : '.'),
  );
}

/** A readable block of one known tool's input. */
interface ReadableBlock {
  key: string;
  label: string;
  copyLabel: string;
  text: string;
  lineNumbers: boolean;
}

const blockLabels = {
  command: ['managedSession.workInspector.command', 'managedSession.workInspector.copyCommand'],
  fileContent: [
    'managedSession.workInspector.fileContent',
    'managedSession.workInspector.copyContent',
  ],
  before: ['managedSession.workInspector.before', 'managedSession.workInspector.copyBefore'],
  after: ['managedSession.workInspector.after', 'managedSession.workInspector.copyAfter'],
} as const;

/**
 * What a known tool's input says, readably: a command wrapped for reading, a written file's
 * content, an edit's text before and after. Unknown tools have none (their raw parameters show).
 */
export function readableBlocks(
  tool: string,
  params: Parameters | undefined,
  t: TFunction,
): ReadableBlock[] {
  if (!params) {
    return [];
  }

  const block = (
    key: string,
    kind: keyof typeof blockLabels,
    text: unknown,
    lineNumbers = false,
  ): ReadableBlock[] =>
    typeof text === 'string'
      ? [
          {
            key,
            label: t(blockLabels[kind][0]),
            copyLabel: t(blockLabels[kind][1]),
            text,
            lineNumbers,
          },
        ]
      : [];
  switch (tool) {
    case 'Bash':
      return block('command', 'command', params.command);
    case 'Write':
      return block('content', 'fileContent', params.content, true);
    case 'Edit':
      return [
        ...block('before', 'before', params.old_string),
        ...block('after', 'after', params.new_string),
      ];
    case 'MultiEdit':
      return (Array.isArray(params.edits) ? (params.edits as unknown[]) : []).flatMap(
        (edit, index) => {
          const change = (edit ?? {}) as Parameters;

          return [
            ...block(`before-${index}`, 'before', change.old_string),
            ...block(`after-${index}`, 'after', change.new_string),
          ];
        },
      );
    default:
      return [];
  }
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
  authorization,
}: {
  item: ToolActionSummary;
  source: ContentSource;
  /** How the permission for this action was answered, between what it ran and its result. */
  authorization?: ReactNode;
  /** Render the header (`ToolActionHeader`) as the first part of the content. */
  withHeader: boolean;
  /** The single-action screen's own heading (no parent Work title above it). */
  asHeading?: boolean;
}) {
  const { t } = useTranslation();
  const failed = workStateTone(item.state) === 'danger';
  const input = useContentText(source, item.input);
  const output = useContentText(source, item.output);
  const params = parameters(input.data?.text);
  const blocks = readableBlocks(item.title.text, params, t);
  const root = workspaceRootOf(params, item.subject);
  const raw = input.data ? detailShape(input.data.text) : undefined;

  return (
    // `gap-5`: the screen's section rhythm (20px) between the header, the readable input, the
    // response and the raw parameters — separate blocks, not one stack of captions.
    <div className="grid min-w-0 gap-5">
      {withHeader && <ToolActionHeader item={item} asHeading={asHeading} />}
      {blocks.map((block) => (
        <CodeSection
          key={block.key}
          label={block.label}
          copyLabel={block.copyLabel}
          text={block.text}
          language="plain"
          lineNumbers={block.lineNumbers}
        />
      ))}
      {authorization}
      {output.data && (
        // Shown with workspace paths relative; Copy keeps the tool's own text.
        <CodeSection
          label={t('managedSession.workInspector.output')}
          copyLabel={t('managedSession.workInspector.copyOutput')}
          text={relativeTo(output.data.text, root)}
          copy={output.data.text}
          language={detailShape(output.data.text).kind === 'json' ? 'json' : 'plain'}
          lineNumbers={false}
        />
      )}
      {item.output && <ContentState content={output} />}
      {raw &&
        input.data &&
        (blocks.length === 0 ? (
          // Nothing above reads them: the parameters are the body, as they are.
          <CodeSection
            label={t('managedSession.workInspector.input')}
            copyLabel={t('managedSession.workInspector.copyInput')}
            text={raw.kind === 'json' ? raw.pretty : raw.text}
            copy={input.data.text}
            language={raw.kind === 'json' ? 'json' : 'plain'}
            lineNumbers={raw.kind === 'json'}
          />
        ) : (
          // Read above: the raw parameters stay one click away.
          <Collapsible>
            <Collapsible.Trigger>
              {t('managedSession.workInspector.rawParameters')}
            </Collapsible.Trigger>
            <Collapsible.Content>
              <CodeSection
                label={t('managedSession.workInspector.input')}
                copyLabel={t('managedSession.workInspector.copyInput')}
                text={raw.kind === 'json' ? raw.pretty : raw.text}
                copy={input.data.text}
                language={raw.kind === 'json' ? 'json' : 'plain'}
                lineNumbers={raw.kind === 'json'}
                heading={false}
              />
            </Collapsible.Content>
          </Collapsible>
        ))}
      {item.input && <ContentState content={input} />}
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
  authorization,
}: {
  item: ToolActionSummary;
  source: ContentSource;
  authorization?: ReactNode;
  /**
   * Heads the content with the action's header (as the screen's heading). False when the workspace
   * already shows it in the detail header row (`SingleToolActionHeader`, `detailHeader`).
   */
  withHeader: boolean;
}) {
  return (
    <ToolActionContent
      item={item}
      source={source}
      withHeader={withHeader}
      asHeading
      authorization={authorization}
    />
  );
}
