import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { FileText } from 'lucide-react';
import {
  AppContent,
  Button,
  Collapsible,
  Icon,
  MarkdownDocument,
  ScrollArea,
  Separator,
  Typography,
  defineSecondaryStack,
} from '@nevo/ui';
import type { RequestOrigin, TextPreview } from '@nevo/specflow-contracts/sessions';
import { translateNow } from '../../../../i18n/message';
import { useMarkdownLabels } from '../../../../i18n/useMarkdownLabels';
import type { ManagedSessionsApi } from '../api';
import { ReadableText } from '../MessageText';
import { ToolDetailCode } from '../ToolDetailCode';
import { useCodeWrapPreference } from '../codeWrapPreference';

/** One part of a brief: SpecFlow's own words, or a block it passed to the agent as data. */
export type BriefPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'data'; readonly source: string; readonly text: string };

const UNTRUSTED = /<untrusted source="([^"]*)">\r?\n?([\s\S]*?)\r?\n?<\/untrusted>/g;

/**
 * A brief split into SpecFlow's own words and the `<untrusted source="…">` blocks it gives the
 * agent as data (the step's purpose, the agent profile, the previous step's hand-off).
 */
export function briefParts(text: string): BriefPart[] {
  const parts: BriefPart[] = [];
  let last = 0;
  for (const match of text.matchAll(UNTRUSTED)) {
    const before = text.slice(last, match.index);
    if (before.trim() !== '') {
      parts.push({ kind: 'text', text: before });
    }

    parts.push({ kind: 'data', source: match[1] ?? '', text: match[2] ?? '' });
    last = match.index + match[0].length;
  }

  const rest = text.slice(last);
  if (rest.trim() !== '') {
    parts.push({ kind: 'text', text: rest });
  }

  return parts;
}

/** "Break the solution down · attempt 2" (with the Task, when the step is a Task's). */
export function briefSubject(t: TFunction, origin: RequestOrigin): string {
  return origin.task
    ? t('managedSession.brief.subjectTask', {
        step: origin.step.title,
        task: origin.task.title,
        attempt: origin.attempt,
      })
    : t('managedSession.brief.subject', { step: origin.step.title, attempt: origin.attempt });
}

/** Readable parts of a step's brief: what a person wants to know, without SpecFlow's protocol. */
export interface ReadableBrief {
  readonly purpose?: string;
  readonly instructions?: string;
  /** The agent profile the step runs with, by its title (never its id). */
  readonly archetype?: { readonly title: string; readonly instructions?: string };
  /** The Task the step works on, by its title (never its id). */
  readonly task?: { readonly title: string; readonly summary?: string };
}

const ARCHETYPE_LINE = /^Archetype: (.+?)(?: \([^()]*\))?\s*$/m;
const TASK_LINE = /^Task: (.+?)(?: \(type [^()]*\))?\s*$/m;

/**
 * The parts of a brief a person reads (the Runtime's brief renderer writes them): the step's
 * purpose and instructions, the agent profile's title and instructions, the Task's title and
 * summary. Everything else (ids, revisions, documents, rules, commands) stays in the full text.
 */
export function readableBrief(text: string): ReadableBrief {
  const data = new Map<string, string>();
  for (const part of briefParts(text)) {
    if (part.kind === 'data' && part.text.trim() !== '' && !data.has(part.source)) {
      data.set(part.source, part.text.trim());
    }
  }

  const archetypeTitle = ARCHETYPE_LINE.exec(text)?.[1]?.trim();
  const taskTitle = TASK_LINE.exec(text)?.[1]?.trim();
  const archetypeInstructions = data.get('archetype.instructions');
  const taskSummary = data.get('task.summary');
  const purpose = data.get('step.purpose');
  const instructions = data.get('step.instructions');

  return {
    ...(purpose ? { purpose } : {}),
    ...(instructions ? { instructions } : {}),
    ...(archetypeTitle
      ? {
          archetype: {
            title: archetypeTitle,
            ...(archetypeInstructions ? { instructions: archetypeInstructions } : {}),
          },
        }
      : {}),
    ...(taskTitle
      ? { task: { title: taskTitle, ...(taskSummary ? { summary: taskSummary } : {}) } }
      : {}),
  };
}

/** An id made readable ("breakdown-review" -> "Breakdown review"), for what the origin names by id. */
function readableId(id: string): string {
  const words = id.replace(/[._-]+/g, ' ').trim();

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
}

/** One titled part of the readable brief: the section-title role, then its content. */
function BriefSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title} className="grid min-w-0 gap-1.5">
      <Typography as="h3" variant="section-label">
        {title}
      </Typography>
      {children}
    </section>
  );
}

function BriefMarkdown({ source }: { readonly source: string }) {
  const markdownLabels = useMarkdownLabels();

  return <MarkdownDocument source={source} labels={markdownLabels} headingOffset={2} />;
}

/** What the previous step handed over, from the request origin's own fields (never its JSON). */
function HandoffSection({ handoff }: { readonly handoff: NonNullable<RequestOrigin['handoff']> }) {
  const { t } = useTranslation();
  const from =
    handoff.kind === 'return'
      ? t('managedSession.brief.handoff.returned')
      : handoff.from
        ? t('managedSession.brief.handoff.from', {
            step: readableId(handoff.from.step),
            attempt: handoff.from.attempt,
          })
        : undefined;
  const transition = handoff.transition ? readableId(handoff.transition) : undefined;
  const line = [from, transition].filter(Boolean).join(' · ');

  return (
    <BriefSection title={t('managedSession.brief.source.handoff')}>
      {line ? (
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {line}
        </Typography>
      ) : null}
      {handoff.feedback ? <BriefMarkdown source={handoff.feedback} /> : null}
      {handoff.artifacts?.length ? (
        <ul className="grid gap-0.5" aria-label={t('managedSession.brief.handoff.artifacts')}>
          {handoff.artifacts.map((artifact) => (
            <li
              key={artifact}
              className="min-w-0 font-mono text-body-sm text-content-secondary [overflow-wrap:anywhere]"
            >
              {artifact}
            </li>
          ))}
        </ul>
      ) : null}
    </BriefSection>
  );
}

/**
 * A brief, readable: the step's purpose and instructions, the Task, the agent profile, the previous
 * step's hand-off and the owner's note, each under its own title once. The full text as the agent
 * received it (SpecFlow's rules, ids and data blocks) stays one disclosure away, verbatim.
 */
export function BriefDocument({
  text,
  origin,
}: {
  readonly text: string;
  readonly origin: RequestOrigin;
}) {
  const { t } = useTranslation();
  const [wrap] = useCodeWrapPreference();
  const brief = readableBrief(text);
  const raw = t('managedSession.brief.fullText');

  return (
    <div className="grid min-w-0 gap-5">
      {brief.purpose ? (
        <BriefSection title={t('managedSession.brief.source.stepPurpose')}>
          <BriefMarkdown source={brief.purpose} />
        </BriefSection>
      ) : null}
      {brief.instructions ? (
        <BriefSection title={t('managedSession.brief.source.stepInstructions')}>
          <BriefMarkdown source={brief.instructions} />
        </BriefSection>
      ) : null}
      {brief.task ? (
        <BriefSection title={t('managedSession.brief.source.task')}>
          <Typography as="p" variant="body-md" className="font-medium text-content-primary">
            {brief.task.title}
          </Typography>
          {brief.task.summary ? <BriefMarkdown source={brief.task.summary} /> : null}
        </BriefSection>
      ) : null}
      {brief.archetype ? (
        <BriefSection title={t('managedSession.brief.source.agentProfile')}>
          <Typography as="p" variant="body-md" className="text-content-primary">
            {brief.archetype.title}
          </Typography>
          {brief.archetype.instructions ? (
            <BriefMarkdown source={brief.archetype.instructions} />
          ) : null}
        </BriefSection>
      ) : null}
      {origin.handoff ? <HandoffSection handoff={origin.handoff} /> : null}
      {origin.ownerNote ? (
        <BriefSection title={t('managedSession.brief.ownerNote')}>
          <Typography
            as="p"
            variant="body-md"
            className="whitespace-pre-wrap text-content-primary [overflow-wrap:anywhere]"
          >
            {origin.ownerNote}
          </Typography>
        </BriefSection>
      ) : null}
      <Collapsible data-brief-full-text="">
        <Collapsible.Trigger>{raw}</Collapsible.Trigger>
        <Collapsible.Content>
          <div className="grid min-w-0 gap-1.5 pt-1">
            <Typography as="p" variant="body-sm" className="text-content-muted">
              {t('managedSession.brief.fullTextNote')}
            </Typography>
            <ToolDetailCode
              text={text}
              language="plain"
              label={raw}
              lineNumbers={false}
              wrap={wrap}
            />
          </div>
        </Collapsible.Content>
      </Collapsible>
    </div>
  );
}

const PURPOSE_FENCE = '<untrusted source="step.purpose">';

/**
 * The step's purpose, from the fenced block the Runtime writes near the top of every brief, as a
 * short instruction: its first paragraph, `undefined` when the loaded text holds none. A preview cut
 * inside the block still yields what it holds.
 */
export function briefPurpose(text: string): string | undefined {
  const start = text.indexOf(PURPOSE_FENCE);
  if (start === -1) {
    return undefined;
  }

  const body = text.slice(start + PURPOSE_FENCE.length);
  const end = body.indexOf('</untrusted>');
  const paragraph = (end === -1 ? body : body.slice(0, end)).trim().split(/\r?\n\s*\r?\n/)[0];

  const purpose = paragraph?.trim();

  return purpose === '' ? undefined : purpose;
}

/** The step a brief is for, by its own title: with the Task, and the attempt from the second on. */
function briefTitle(t: TFunction, origin: RequestOrigin): string {
  return origin.attempt > 1
    ? briefSubject(t, origin)
    : origin.task
      ? t('managedSession.brief.titleTask', { step: origin.step.title, task: origin.task.title })
      : origin.step.title;
}

/**
 * The request SpecFlow wrote for an agent's step (`origin.kind` `specflow-step-brief`), as the first
 * message of the conversation: the owner's bubble style, since it plays the part of the request,
 * labelled **Generated by SpecFlow** so it never reads as the owner's words. The step's title and its
 * purpose as a short instruction, the full brief one action away; never the raw prompt.
 *
 * A Continue of the same attempt (`origin.continuation`) is not a new brief: an **Execution resumed**
 * divider, then a bubble **Continue attempt N**, with its own brief one action away.
 */
export function StepBriefMessage({
  origin,
  text,
  onOpen,
}: {
  readonly origin: RequestOrigin;
  readonly text: TextPreview;
  readonly onOpen: () => void;
}) {
  const { t } = useTranslation();
  const purpose = origin.continuation ? undefined : briefPurpose(text.text);

  return (
    <div className="grid min-w-0 gap-4">
      {origin.continuation && (
        <div className="flex items-center gap-3" data-brief-resumed="">
          <Separator className="flex-1" />
          <Typography as="p" variant="body-sm" className="shrink-0 text-content-secondary">
            {t('managedSession.brief.resumed')}
          </Typography>
          <Separator className="flex-1" />
        </div>
      )}
      <div className="grid min-w-0 justify-end">
        <div className="grid max-w-content-standard min-w-0 gap-1 rounded-composite bg-surface-primary px-4 pt-3 pb-1.5">
          <Typography
            as="p"
            variant="body-sm"
            className="flex items-center gap-1.5 text-content-secondary"
          >
            <Icon name="workflow" size="sm" aria-hidden="true" />
            {t('managedSession.brief.generated')}
          </Typography>
          {origin.continuation ? (
            <Typography as="p" variant="title-sm" className="text-content-primary">
              {t('managedSession.brief.continue', { attempt: origin.attempt })}
            </Typography>
          ) : (
            <>
              <Typography as="p" variant="title-sm" className="text-content-primary">
                {briefTitle(t, origin)}
              </Typography>
              {purpose && (
                <Typography
                  as="p"
                  variant="body-md"
                  className="line-clamp-3 text-content-primary [overflow-wrap:anywhere]"
                >
                  {purpose}
                </Typography>
              )}
            </>
          )}
          <span className="-ml-2">
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={FileText}
              // Readable on the request surface (the ghost tone is meant for neutral surfaces).
              className="text-content-primary"
              onClick={onOpen}
            >
              {origin.continuation
                ? t('managedSession.brief.openContinuation')
                : t('managedSession.brief.openFull')}
            </Button>
          </span>
        </div>
      </div>
      {origin.ownerNote ? (
        // The owner's note sent with this brief (a Continue's note for the agent): their own words,
        // in their own message style, after SpecFlow's message.
        <div className="grid min-w-0 justify-end" data-brief-owner-note="">
          <div className="grid max-w-content-standard min-w-0 gap-1 rounded-composite bg-surface-primary px-4 py-3">
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {t('managedSession.brief.ownerNote')}
            </Typography>
            <Typography
              as="p"
              variant="body-md"
              className="whitespace-pre-wrap text-content-primary [overflow-wrap:anywhere]"
            >
              {origin.ownerNote}
            </Typography>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface BriefRoot {
  readonly sessionId: string;
  readonly entryId: string;
  readonly origin: RequestOrigin;
  readonly text: TextPreview;
}

type BriefData = BriefRoot & { readonly api: ManagedSessionsApi };

function BriefScreen({ data }: { readonly data: BriefData }) {
  const { t } = useTranslation();

  return (
    <AppContent className="h-full w-full">
      <ScrollArea className="min-h-0 w-full flex-1" contentClassName="grid gap-5 px-4 pt-4 pb-6">
        <div className="grid gap-1">
          <Typography as="h2" variant="title-sm" className="text-content-primary">
            {briefSubject(t, data.origin)}
          </Typography>
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {data.origin.continuation
              ? t('managedSession.brief.introContinuation')
              : t('managedSession.brief.intro')}
          </Typography>
        </div>
        <ReadableText
          api={data.api}
          sessionId={data.sessionId}
          value={data.text}
          render={(text) => <BriefDocument text={text} origin={data.origin} />}
        />
      </ScrollArea>
    </AppContent>
  );
}

/** "Show what the agent received": the full brief on its own screen, like a Work's detail. */
export function createStepBriefStack(api: ManagedSessionsApi) {
  return defineSecondaryStack<BriefRoot, BriefData, { brief: Record<string, never> }>({
    id: 'managed-session-brief',
    initial: 'brief',
    instanceId: (root) => root.entryId,
    tabLabel: () => translateNow('managedSession.brief.title'),
    useData: (root) => ({ status: 'ready', data: { ...root, api } }),
    screens: {
      brief: {
        get title() {
          return translateNow('managedSession.brief.title');
        },
        component: BriefScreen,
      },
    },
  });
}
