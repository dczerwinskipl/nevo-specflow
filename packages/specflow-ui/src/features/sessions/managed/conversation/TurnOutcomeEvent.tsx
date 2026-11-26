import { useTranslation } from 'react-i18next';
import { Alert, Button, Collapsible, Typography } from '@nevo/ui';
import { outcomeCause } from '../outcomeReason';
import { workStateTone } from '../workStatus';
import type { TurnOutcomeItem } from './transcriptItems';
import { productIcons } from '../../../../shared/product-icons';

/**
 * How a Turn that did not simply complete ended (full-session.md "Turn outcome"): ONE event at the
 * end of the Turn, never repeated in the tool rows, as a SpecFlow notice row or in the Work history
 * link. What happened (the title), the actual cause, what it may have left behind (only when the
 * Turn opened tool actions that change the workspace) and what to do about it:
 *
 * - The consequence uses the real state when the Runtime reports the Specification's workspace
 *   changes ("3 files are uncommitted in the workspace now"); only when it does not, it says changes
 *   "may" have been made.
 * - **Review workspace changes** opens the Specification's uncommitted changes, the view the app
 *   already has for them (the Specification's own workspace, where its agent works), only when that
 *   view can show some: never a "not available" page.
 * - **View technical details** discloses the Runtime's error code and message.
 *
 * Failed tool actions stay in the stage's tool row only. The tone follows the shared state
 * vocabulary (`workStatus.ts`): failed is danger, stopped and interrupted attention.
 */
export function TurnOutcomeEvent({
  item,
  onReviewChanges,
  workspaceChanges,
}: {
  item: TurnOutcomeItem;
  /** Opens the workspace changes; absent when there are none the app can show. */
  onReviewChanges?: () => void;
  /** Uncommitted files in the Specification's workspace now; absent when that is not known. */
  workspaceChanges?: number;
}) {
  const { t } = useTranslation();
  const tone = workStateTone(item.outcome);
  const review = item.workspaceMayHaveChanged && onReviewChanges;

  return (
    <article data-entry-id={item.id} data-turn-outcome={item.outcome} className="grid min-w-0">
      <Alert
        tone={tone === 'danger' ? 'danger' : 'attention'}
        title={t(`managedSession.workSummary.outcome.${item.outcome}`)}
        actions={
          review ? (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={productIcons.changes}
              onClick={onReviewChanges}
            >
              {t('managedSession.turnOutcome.reviewChanges')}
            </Button>
          ) : undefined
        }
      >
        <p className="text-content-primary">
          {outcomeCause(item.outcome, item.error, item.notices, t)}
        </p>
        {item.workspaceMayHaveChanged && (
          <p
            className="mt-1"
            data-turn-consequence={workspaceChanges === undefined ? 'may' : 'known'}
          >
            {workspaceChanges === undefined
              ? t('managedSession.turnOutcome.consequence')
              : workspaceChanges > 0
                ? t('managedSession.turnOutcome.changesLeft', { count: workspaceChanges })
                : t('managedSession.turnOutcome.noChangesLeft')}
          </p>
        )}
        {item.error && (
          <div className="mt-2">
            <Collapsible density="inline" className="w-full">
              <Collapsible.Trigger>{t('managedSession.turnOutcome.details')}</Collapsible.Trigger>
              <Collapsible.Content>
                <Typography
                  as="p"
                  variant="body-sm"
                  className="font-mono text-content-secondary [overflow-wrap:anywhere]"
                >
                  {item.error.code}
                </Typography>
                <Typography
                  as="p"
                  variant="body-sm"
                  className="text-content-secondary [overflow-wrap:anywhere]"
                >
                  {item.error.message}
                </Typography>
              </Collapsible.Content>
            </Collapsible>
          </div>
        )}
      </Alert>
    </article>
  );
}
