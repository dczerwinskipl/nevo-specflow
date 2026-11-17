import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, InlineNote, Typography } from '@nevo/ui';
import { formatList } from '../../../../i18n/formatList';
import { message, useMessage } from '../../../../i18n/message';
import type { StartCatalogue } from '../catalogue/startCatalogue';
import { AgentDiagnosisPanel } from './AgentDiagnosisPanel';
import { agentAvailability, onlyRestartHelps, recheckCanHelp } from './agentAvailability';
import { agentStatusText } from './agentStatus';
import { DiagnosisMessage } from './DiagnosisText';

/** "Nie znaleziono CLI" -> "nie znaleziono CLI" after a colon; "CLI not found" keeps its acronym. */
function lowerFirst(value: string) {
  return /^.\p{Ll}/u.test(value) ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

/**
 * Under the agent picker: one line naming the agents that cannot start, or, when none can, the
 * screen's message. Confirmed unavailability leads with **How to fix**; a check without a result
 * (undetermined) leads with **Check again**, which is offered only where a recheck can change the
 * result (else the restart is the next step). The details open in `AgentDiagnosisPanel`. The note
 * is a polite live region, so what a recheck changed is announced.
 */
export function AgentAvailabilityNote({
  id,
  catalogue,
  refreshing,
  onRefresh,
  focusFallback,
}: {
  /** Describes the picker: the line or the heading carries it. */
  id: string;
  catalogue: StartCatalogue;
  refreshing: boolean;
  /** Reads the catalogue again (discovery and the sign-in checks run again). */
  onRefresh?: () => void;
  /** Where focus goes when the panel closes and the button that opened it is gone. */
  focusFallback: () => HTMLElement | null;
}) {
  const { t, i18n } = useTranslation();
  const text = useMessage();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const summary = agentAvailability(catalogue);
  // Every agent became available: nothing is left to explain, and the panel goes with the note.
  if (open && summary.kind === 'all') {
    setOpen(false);
  }

  const returnFocus = (event: Event) => {
    event.preventDefault();
    const opener = trigger.current;
    (opener?.isConnected ? opener : focusFallback())?.focus();
  };

  if (summary.kind === 'all') {
    return <div role="status" className="empty:hidden" />;
  }

  const { unavailable, onlyUndetermined } = summary;
  const recheck = unavailable.some(recheckCanHelp);
  const restartOnly = unavailable.every(onlyRestartHelps);
  const details = (primary: boolean) => (
    <Button
      ref={trigger}
      type="button"
      variant={primary ? 'primary' : 'secondary'}
      size="sm"
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
    >
      {onlyUndetermined
        ? t('sessionStart.diagnostics.details')
        : t('sessionStart.diagnostics.howToFix')}
    </Button>
  );
  const checkAgain = (primary: boolean) =>
    onRefresh && (
      <Button
        type="button"
        variant={primary ? 'primary' : 'secondary'}
        size="sm"
        disabled={refreshing}
        aria-busy={refreshing || undefined}
        onClick={onRefresh}
      >
        {t('sessionStart.diagnostics.checkAgain')}
      </Button>
    );
  const panel = (
    <AgentDiagnosisPanel
      open={open}
      onOpenChange={setOpen}
      agents={unavailable}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onCloseAutoFocus={returnFocus}
    />
  );

  if (summary.kind !== 'some') {
    const undetermined = summary.kind === 'undetermined';

    return (
      <div role="status" className="grid gap-3">
        <div className="flex items-start gap-2">
          <span className="flex h-5 items-center">
            <Icon
              name={undetermined ? 'clock' : 'circle-alert'}
              size="sm"
              aria-hidden="true"
              className={undetermined ? 'text-content-muted' : 'text-status-danger'}
            />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <Typography as="h2" variant="title-sm" id={id}>
              {undetermined
                ? t('sessionStart.diagnostics.undeterminedHeading')
                : t('sessionStart.diagnostics.noneHeading')}
            </Typography>
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {undetermined
                ? t('sessionStart.diagnostics.undeterminedLine')
                : t('sessionStart.diagnostics.noneLine')}
            </Typography>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pl-6">
          {undetermined ? checkAgain(true) : details(true)}
          {undetermined ? details(false) : recheck && checkAgain(false)}
        </div>
        {restartOnly && (
          // Every fix needs a restart: no recheck can change this, so the next step is said.
          <div className="flex items-start gap-2 pl-6">
            <span className="flex h-5 items-center">
              <Icon name="info" size="sm" aria-hidden="true" className="text-content-muted" />
            </span>
            <DiagnosisMessage value={message('sessionStart.diagnostics.thenRestart')} />
          </div>
        )}
        {panel}
      </div>
    );
  }

  const [first] = unavailable;
  const line =
    unavailable.length === 1 && first
      ? t('sessionStart.diagnostics.oneUnavailable', {
          provider: first.title,
          status: lowerFirst(agentStatusText(first, catalogue.demo, text)),
        })
      : t('sessionStart.diagnostics.someUnavailable', {
          providers: formatList(
            unavailable.map((provider) => provider.title),
            i18n.resolvedLanguage,
          ),
        });

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <InlineNote
        tone={onlyUndetermined ? 'info' : 'attention'}
        icon={onlyUndetermined ? 'clock' : undefined}
        className="min-w-0"
      >
        <span id={id}>{line}</span>
      </InlineNote>
      <div className="flex items-center gap-2">
        {onlyUndetermined && recheck && checkAgain(false)}
        {details(false)}
      </div>
      {panel}
    </div>
  );
}
