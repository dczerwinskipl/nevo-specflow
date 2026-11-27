import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import {
  AppContent,
  AppWorkspaceBody,
  Button,
  Typography,
  WorkspaceHeaderIdentity,
  defineSecondaryStack,
  type SecondaryData,
  type SecondaryScreenProps,
} from '@nevo/ui';
import type { WorkflowHistory } from '@nevo/specflow-contracts/workflow';
import { LoadingPresentation } from '../../../../app/loading/LoadingPresentation';
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

/** Between the result's feedback and a Reject's, when Copy takes both. */
const PARAGRAPH_BREAK = '\n\n';

/** Which subject's history holds the feedback, and which feedback. */
export interface FeedbackRoot {
  readonly specId: string;
  readonly taskId?: string;
  readonly ref: FeedbackRef;
}

/**
 * What the screen shows. The history read's own states (loading, failed, not held) are the screen's,
 * not the host's: the screen keeps its reading width in every state, so a Secondary that sizes to its
 * content never opens as a sliver while the history loads.
 */
type FeedbackState =
  | { readonly kind: 'loading'; readonly fetching: boolean }
  | { readonly kind: 'failed'; readonly retry: () => void }
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'ready';
      readonly subject: FeedbackSubject;
      readonly items: WorkflowHistory['items'];
    };

interface FeedbackData {
  readonly specId: string;
  readonly state: FeedbackState;
  /** The original Markdown, for Copy; empty until the feedback is read. */
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
  const history = useWorkflowHistory(taskId ? { specId, taskId } : { specId });
  const { copied, copy } = useCopied();
  const subject = history.data ? findFeedbackSubject(history.data.items, ref) : undefined;
  const state: FeedbackState = history.data
    ? subject
      ? { kind: 'ready', subject, items: history.data.items }
      : { kind: 'missing' }
    : history.isError
      ? { kind: 'failed', retry: () => void history.refetch() }
      : { kind: 'loading', fetching: history.fetchStatus === 'fetching' };
  const markdown = subject
    ? feedbackSections(subject)
        .map((section) => section.markdown)
        .join(PARAGRAPH_BREAK)
    : '';

  return {
    status: 'ready',
    data: { specId, state, markdown, copied, copy: () => copy(markdown) },
  };
}

function FeedbackHeader() {
  const { t } = useTranslation();

  return <WorkspaceHeaderIdentity headingLevel={2} title={t('workflowExecution.feedback.label')} />;
}

function FeedbackScreen({ data }: SecondaryScreenProps<FeedbackData, Record<never, never>>) {
  const { t } = useTranslation();
  const { state } = data;

  return (
    <AppContent className="w-content-standard max-w-full">
      <AppWorkspaceBody padding="none" scroll="area">
        {state.kind === 'ready' ? (
          <FeedbackView subject={state.subject} items={state.items} specId={data.specId} />
        ) : (
          <div className="grid justify-items-start gap-3 p-4" data-feedback-state={state.kind}>
            {state.kind === 'loading' ? (
              <LoadingPresentation
                shape="document"
                label={t('workflowExecution.feedback.loading')}
                fetching={state.fetching}
              />
            ) : (
              <Typography as="p" variant="body-md" role="status">
                {t(
                  state.kind === 'failed'
                    ? 'workflowExecution.feedback.failed'
                    : 'workflowExecution.feedback.missing',
                )}
              </Typography>
            )}
            {state.kind === 'failed' ? (
              <Button variant="secondary" size="sm" onClick={state.retry}>
                {t('common.retry')}
              </Button>
            ) : null}
          </div>
        )}
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
