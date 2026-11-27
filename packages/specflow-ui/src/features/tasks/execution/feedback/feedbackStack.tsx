import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import {
  AppContent,
  AppWorkspaceBody,
  WorkspaceHeaderIdentity,
  defineSecondaryStack,
  type SecondaryData,
  type SecondaryScreenProps,
} from '@nevo/ui';
import type { WorkflowHistory } from '@nevo/specflow-contracts/workflow';
import { translateNow } from '../../../../i18n/message';
import { copyText } from '../../../../shared/clipboard/copyText';
import { useWorkflowHistory } from '../agent/useWorkflowHistory';
import { FeedbackView } from './FeedbackView';
import {
  feedbackSections,
  findFeedbackSubject,
  type FeedbackRef,
  type FeedbackSubject,
} from './feedbackRef';

/** Which subject's history holds the feedback, and which feedback. */
export interface FeedbackRoot {
  readonly specId: string;
  readonly taskId?: string;
  readonly ref: FeedbackRef;
}

interface FeedbackData {
  readonly specId: string;
  readonly subject: FeedbackSubject;
  readonly items: WorkflowHistory['items'];
  /** The original Markdown, for Copy. */
  readonly markdown: string;
  readonly copied: boolean;
  readonly copy: () => void;
}

interface FeedbackPages {
  feedback: Record<never, never>;
}

/** The Copy header action's state: "Copied" for a moment after a copy that happened. */
function useCopied() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Synchronises with the timer: none outlives the screen.
  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    copied,
    copy: (text: string) => {
      void copyText(text).then((done) => {
        clearTimeout(timer.current);
        setCopied(done);
        if (done) {
          timer.current = setTimeout(() => setCopied(false), 2000);
        }
      });
    },
  };
}

function useFeedbackData({ specId, taskId, ref }: FeedbackRoot): SecondaryData<FeedbackData> {
  const { t } = useTranslation();
  const history = useWorkflowHistory(taskId ? { specId, taskId } : { specId });
  const { copied, copy } = useCopied();
  if (history.isPending) {
    return { status: 'loading' };
  }

  if (history.isError) {
    return {
      status: 'error',
      message: t('workflowExecution.feedback.failed'),
      retry: () => void history.refetch(),
    };
  }

  const subject = findFeedbackSubject(history.data.items, ref);
  if (!subject) {
    return { status: 'unavailable', message: t('workflowExecution.feedback.missing') };
  }

  const markdown = feedbackSections(subject)
    .map((section) => section.markdown)
    .join('\n\n');

  return {
    status: 'ready',
    data: {
      specId,
      subject,
      items: history.data.items,
      markdown,
      copied,
      copy: () => copy(markdown),
    },
  };
}

function FeedbackHeader() {
  const { t } = useTranslation();

  return <WorkspaceHeaderIdentity headingLevel={2} title={t('workflowExecution.feedback.label')} />;
}

function FeedbackScreen({ data }: SecondaryScreenProps<FeedbackData, Record<never, never>>) {
  const { t } = useTranslation();

  return (
    <AppContent className="w-content-standard max-w-full">
      <AppWorkspaceBody padding="none" scroll="area">
        <FeedbackView subject={data.subject} items={data.items} specId={data.specId} />
        <span role="status" aria-live="polite" className="sr-only">
          {data.copied ? t('workflowExecution.feedback.copied') : ''}
        </span>
      </AppWorkspaceBody>
    </AppContent>
  );
}

/**
 * The shared Feedback view as a Secondary screen (workflow-execution.md, "Feedback"): opened from
 * Now's Last hand-off (`open`: Back returns to Now) and pushed from a history entry (`navTo`: Back
 * returns to the history). Copy in its header copies the original Markdown.
 */
export const feedbackStack = defineSecondaryStack<FeedbackRoot, FeedbackData, FeedbackPages>({
  id: 'workflow-feedback',
  initial: 'feedback',
  useData: useFeedbackData,
  screens: {
    feedback: {
      get title() {
        return translateNow('workflowExecution.feedback.label');
      },
      header: FeedbackHeader,
      actions: ({ data }) =>
        data.markdown
          ? [
              {
                id: 'copy-feedback',
                label: translateNow(
                  data.copied
                    ? 'workflowExecution.feedback.copied'
                    : 'workflowExecution.feedback.copy',
                ),
                icon: data.copied ? Check : Copy,
                presentation: 'icon',
                direct: 'always',
                onPress: data.copy,
              },
            ]
          : [],
      component: FeedbackScreen,
    },
  },
});
