import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, MarkdownDocument, Separator, Typography } from '@nevo/ui';
import type { WorkflowHistory } from '@nevo/specflow-contracts/workflow';
import { useMarkdownLabels } from '../../../../i18n/useMarkdownLabels';
import { actorLabel, formatWhen } from '../presentation';
import { useViewer } from '../useViewer';
import { useAgentTitles } from '../agent/modelTitles';
import {
  AgentIdentityLine,
  attemptOutcome,
  outcomeTextClass,
  type AgentHistoryItem,
  type AttemptOutcomeView,
} from '../agent/AgentAttemptHistory';
import { plainOutcome, stepTitleOf } from '../agent/WorkflowHistoryEntry';
import { DecisionLine } from './FeedbackParts';
import { feedbackSections, type FeedbackSubject } from './feedbackRef';

type HistoryItem = WorkflowHistory['items'][number];

function OutcomeLine({ outcome }: { readonly outcome: AttemptOutcomeView }) {
  return (
    <Typography
      as="p"
      variant="body-sm"
      className={`flex min-w-0 items-start gap-2 ${outcomeTextClass(outcome)}`}
      data-feedback-outcome=""
    >
      <span className="flex h-[1lh] shrink-0 items-center">
        <Icon
          name={outcome.icon}
          size="sm"
          aria-hidden="true"
          {...(outcome.iconClassName ? { className: outcome.iconClassName } : {})}
        />
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{outcome.label}</span>
    </Typography>
  );
}

function MetaLine({ children }: { readonly children: string }) {
  return (
    <Typography as="p" variant="body-sm" className="text-content-muted" data-feedback-meta="">
      {children}
    </Typography>
  );
}

/**
 * The one place that presents a hand-off's feedback whole (workflow-execution.md, "Feedback"),
 * reached by "View feedback" from Now's Last hand-off and from every history entry: the step, how
 * it ended, "Attempt N · <when>", who worked on it (an agent with Open session) and the owner's
 * decision, then the original Markdown in the shared renderer. A Reject's feedback follows the
 * result's, each under its own label.
 */
export function FeedbackView({
  subject,
  items,
  specId,
}: {
  readonly subject: FeedbackSubject;
  readonly items: readonly HistoryItem[];
  readonly specId: string;
}) {
  const { t, i18n } = useTranslation();
  const viewer = useViewer();
  const titles = useAgentTitles(specId);
  const labels = useMarkdownLabels();
  const sections = feedbackSections(subject);
  const when = (at: string) => formatWhen(t, at, i18n.language);

  let head;
  if (subject.kind === 'return') {
    head = (
      <>
        <Typography as="h3" variant="title-md" className="[overflow-wrap:anywhere]">
          {stepTitleOf(items, subject.item.to)}
        </Typography>
        <OutcomeLine
          outcome={{
            // Under the step's title: the step it went back to is the title already.
            label: t('workflowExecution.now.returned'),
            icon: 'undo',
            tone: 'neutral',
            toned: false,
          }}
        />
        <MetaLine>{when(subject.item.at)}</MetaLine>
      </>
    );
  } else {
    const { item } = subject;
    const agent = item.agent ? (item as AgentHistoryItem) : undefined;
    const outcome = agent
      ? attemptOutcome(t, agent, items, viewer)
      : plainOutcome(t, { ...item, actor: item.actor! }, items);
    const person = !agent && item.actor ? actorLabel(t, item.actor, viewer, titles) : undefined;
    head = (
      <>
        <Typography as="h3" variant="title-md" className="[overflow-wrap:anywhere]">
          {item.stepTitle || stepTitleOf(items, item.step)}
        </Typography>
        <OutcomeLine outcome={outcome} />
        <MetaLine>
          {[
            t('taskDetails.attempt', { count: item.attempt }),
            when(item.endedAt ?? item.startedAt),
            person,
          ]
            .filter(Boolean)
            .join(' · ')}
        </MetaLine>
        {agent ? <AgentIdentityLine item={agent} specId={specId} /> : null}
        {item.confirmation ? <DecisionLine confirmation={item.confirmation} withDay /> : null}
      </>
    );
  }

  return (
    <article className="grid min-w-0 gap-5 p-4" data-feedback-view="">
      <div className="grid min-w-0 gap-1.5">{head}</div>
      <Separator />
      {sections.map((section, index) => (
        <Fragment key={section.source}>
          {index > 0 ? <Separator /> : null}
          <section className="grid min-w-0 gap-2" data-feedback-section={section.source}>
            {sections.length > 1 ? (
              <Typography as="h4" variant="label-sm" className="text-content-secondary">
                {t(
                  section.source === 'rejection'
                    ? 'workflowExecution.feedback.rejectionSection'
                    : 'workflowExecution.feedback.resultSection',
                )}
              </Typography>
            ) : null}
            <div className="min-w-0" data-feedback-markdown="">
              <MarkdownDocument
                source={section.markdown}
                labels={labels}
                // Under the step's h3: a Markdown "#" is its sibling, or nests under the section's
                // own h4 label when there are two sections.
                headingOffset={sections.length > 1 ? 3 : 2}
              />
            </div>
          </section>
        </Fragment>
      ))}
    </article>
  );
}
