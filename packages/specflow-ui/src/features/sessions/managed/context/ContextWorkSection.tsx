import { useTranslation } from 'react-i18next';
import { InformationList } from '@nevo/ui';
import { ContextDocumentationRow } from './ContextDocumentationRow';
import { ContextNavigationRow } from './ContextNavigationRow';
import { ContextNote, ContextSection, ContextSkeletonRows } from './ContextSectionFrame';
import { resolveSection } from './sessionContextAvailability';
import type { SessionContextViewModel } from './sessionContextTypes';

/**
 * "Work": the real entry into what the Session did. One row, "Work history", that opens the
 * Session's current (or last) Turn's own Work tab; the secondary line names which of the two it is
 * (the same `runningTurnId` rule as the context-window caption). Loading before the first snapshot
 * shows the label with one skeleton row; unreadable or missing history shows the label with a
 * warning note (§7.6); with no Turn yet (or no way to open one) the section is simply absent.
 * A Session without a Specification section lists the project documentation as its first row
 * (`onOpenDocumentation`); the section then stays for that row.
 */
export function ContextWorkSection({
  workHistory,
  runningTurnId,
  onOpen,
  onOpenDocumentation,
}: {
  workHistory: SessionContextViewModel['workHistory'];
  runningTurnId?: string;
  /** Opens the Turn's Work tab; absent when the host has no Work stack, so no row is offered. */
  onOpen?: (turnId: string) => void;
  /** The documentation row, first in the section (Sessions without a Specification section). */
  onOpenDocumentation?: () => void;
}) {
  const { t } = useTranslation();
  const resolved = resolveSection(workHistory, false);
  const workRow = resolved.kind === 'ready' && onOpen !== undefined;
  if (
    !onOpenDocumentation &&
    (resolved.kind === 'omit' || (resolved.kind === 'ready' && !onOpen))
  ) {
    return null;
  }

  return (
    <ContextSection
      title={t('sessions.context.work.sectionTitle')}
      busy={resolved.kind === 'skeleton'}
    >
      {(onOpenDocumentation !== undefined || workRow) && (
        <InformationList>
          {onOpenDocumentation && <ContextDocumentationRow onOpen={onOpenDocumentation} />}
          {resolved.kind === 'ready' && onOpen && (
            <ContextNavigationRow
              icon="clock"
              label={t('sessions.context.workHistory.title')}
              secondary={t(
                resolved.value.turnId === runningTurnId
                  ? 'sessions.context.work.currentTurn'
                  : 'sessions.context.work.lastTurn',
              )}
              onClick={() => onOpen(resolved.value.turnId)}
            />
          )}
        </InformationList>
      )}
      {resolved.kind === 'skeleton' && <ContextSkeletonRows rows={['identity']} />}
      {(resolved.kind === 'warning' || resolved.kind === 'error') && (
        <ContextNote kind="warning">
          {t('sessions.context.availability.workUnreadable')}
        </ContextNote>
      )}
    </ContextSection>
  );
}
