import { useId, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionStartPending } from '../source/sessionStartSource';
import { pendingLabel } from './pendingLabel';
import { StartFormActions } from './StartFormActions';

/**
 * Resolving an earlier start whose outcome is unknown, without the form: used while the provider
 * catalogue is loading or unreadable. A kept request is resent as it was, whatever the catalogue
 * says now, so it must stay reachable.
 */
export function PendingStartActions({
  pending,
  working,
  onStart,
}: {
  pending: SessionStartPending;
  /** A start is in flight. */
  working: boolean;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const noteId = useId();
  const busy = working || pending.checking;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy) {
      onStart();
    }
  };

  return (
    <form onSubmit={submit} aria-label={t('sessionStart.form.title')}>
      <StartFormActions
        noteId={noteId}
        note={t('create.footer.operationKept')}
        label={working ? t('sessionStart.form.starting') : pendingLabel(t, pending)}
        disabled={busy}
        pending={busy}
      />
    </form>
  );
}
