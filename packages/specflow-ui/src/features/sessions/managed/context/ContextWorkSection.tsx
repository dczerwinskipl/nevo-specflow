import { useTranslation } from 'react-i18next';
import { InformationList } from '@nevo/ui';
import { ContextNavigationRow } from './ContextNavigationRow';
import { ContextSection, ContextSkeletonRows } from './ContextSectionFrame';
import type { SessionContextViewModel } from './sessionContextTypes';

/**
 * "Work": the real entry into what the Session did. One row, "Work history", that opens the
 * Session's current (or last) Turn's own Work tab; the secondary line names which of the two it is
 * (the same `runningTurnId` rule as the context-window caption). Loading before the first snapshot
 * shows the label with one skeleton row; with no Turn yet (or no way to open one) the section is
 * simply absent.
 */
export function ContextWorkSection({
  workHistory,
  runningTurnId,
  onOpen,
}: {
  workHistory: SessionContextViewModel['workHistory'];
  runningTurnId?: string;
  /** Opens the Turn's Work tab; absent when the host has no Work stack, so no row is offered. */
  onOpen?: (turnId: string) => void;
}) {
  const { t } = useTranslation();
  if (!workHistory || !onOpen) {
    return null;
  }

  if (workHistory.status !== 'ready' && workHistory.status !== 'loading') {
    return null;
  }

  const loading = workHistory.status === 'loading';

  return (
    <ContextSection title={t('sessions.context.work.sectionTitle')} busy={loading}>
      {workHistory.status === 'loading' ? (
        <ContextSkeletonRows rows={['identity']} />
      ) : (
        <InformationList>
          <ContextNavigationRow
            icon="clock"
            label={t('sessions.context.workHistory.title')}
            secondary={t(
              workHistory.value.turnId === runningTurnId
                ? 'sessions.context.work.currentTurn'
                : 'sessions.context.work.lastTurn',
            )}
            onClick={() => onOpen(workHistory.value.turnId)}
          />
        </InformationList>
      )}
    </ContextSection>
  );
}
