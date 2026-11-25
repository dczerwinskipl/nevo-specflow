import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { FileText } from 'lucide-react';
import {
  AppContent,
  Button,
  InlineNote,
  MarkdownDocument,
  ScrollArea,
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

/** JSON pretty-printed (the hand-off), else `undefined`. */
function prettyJson(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return undefined;
  }
}

/** The name of a data block for people: a known source by its words, another one made readable. */
function sourceLabel(t: TFunction, source: string): string {
  const known: Record<string, string> = {
    'step.purpose': t('managedSession.brief.source.stepPurpose'),
    'step.instructions': t('managedSession.brief.source.stepInstructions'),
    'archetype.profile': t('managedSession.brief.source.agentProfile'),
    handoff: t('managedSession.brief.source.handoff'),
  };
  const words = source.replace(/[._-]+/g, ' ').trim();

  return known[source] ?? (words ? words.charAt(0).toUpperCase() + words.slice(1) : source);
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

/** A brief, readable: SpecFlow's words as Markdown, each data block labelled under a quote rule. */
export function BriefDocument({ text }: { readonly text: string }) {
  const { t } = useTranslation();
  const markdownLabels = useMarkdownLabels();
  const [wrap] = useCodeWrapPreference();

  return (
    <div className="grid min-w-0 gap-4">
      {briefParts(text).map((part, index): ReactNode => {
        if (part.kind === 'text') {
          return (
            <MarkdownDocument
              key={index}
              source={part.text}
              labels={markdownLabels}
              headingOffset={1}
            />
          );
        }

        const label = sourceLabel(t, part.source);
        const json = prettyJson(part.text);

        return (
          <section
            key={index}
            aria-label={label}
            className="grid min-w-0 gap-1.5"
            data-brief-source={part.source}
          >
            <Typography as="h3" variant="section-label">
              {label}
            </Typography>
            <Typography as="p" variant="body-sm" className="text-content-muted">
              {t('managedSession.brief.dataNote')}
            </Typography>
            {json ? (
              <ToolDetailCode text={json} language="json" label={label} lineNumbers wrap={wrap} />
            ) : (
              <p className="border-l-2 border-border-default pl-3 text-body-md whitespace-pre-wrap text-content-primary wrap-anywhere">
                {part.text.trim()}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * The request SpecFlow wrote to start an agent's step (`origin.kind` `specflow-step-brief`): not the
 * owner's bubble but SpecFlow's own line, naming the step and attempt, with the brief one action away.
 */
export function StepBriefLine({
  origin,
  onOpen,
}: {
  readonly origin: RequestOrigin;
  readonly onOpen: () => void;
}) {
  const { t } = useTranslation();

  return (
    <InlineNote tone="info">
      <span className="font-semibold text-content-primary">
        {t('managedSession.notice.source')}
      </span>{' '}
      {t('managedSession.brief.line', { subject: briefSubject(t, origin) })}
      <span className="mt-1 block">
        <Button size="sm" variant="ghost" leadingIcon={FileText} onClick={onOpen}>
          {t('managedSession.brief.open')}
        </Button>
      </span>
    </InlineNote>
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
      <ScrollArea className="min-h-0 w-full flex-1" contentClassName="grid gap-4 px-4 pt-4 pb-6">
        <div className="grid gap-1">
          <Typography as="h2" variant="title-sm" className="text-content-primary">
            {briefSubject(t, data.origin)}
          </Typography>
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {t('managedSession.brief.intro')}
          </Typography>
        </div>
        <ReadableText
          api={data.api}
          sessionId={data.sessionId}
          value={data.text}
          render={(text) => <BriefDocument text={text} />}
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
