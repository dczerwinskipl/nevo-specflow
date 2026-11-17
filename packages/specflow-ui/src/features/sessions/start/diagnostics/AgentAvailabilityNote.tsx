import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, InlineNote, Typography } from '@nevo/ui';
import { formatList } from '../../../../i18n/formatList';
import type { StartCatalogue } from '../catalogue/startCatalogue';
import { useMessage } from '../../../../i18n/message';
import { AgentDiagnosisPanel } from './AgentDiagnosisPanel';
import { agentAvailability } from './agentAvailability';
import { agentStatusText } from './agentStatus';

/** "Nie znaleziono CLI" -> "nie znaleziono CLI" after a colon; "CLI not found" keeps its acronym. */
function lowerFirst(value: string) {
  return /^.\p{Ll}/u.test(value) ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

/**
 * Under the agent picker: one line naming the agents that cannot start, or, when none can, the
 * screen's message. Confirmed unavailability leads with **How to fix**; a check without a result
 * (undetermined) leads with **Check again**. The details open in `AgentDiagnosisPanel`.
 */
export function AgentAvailabilityNote({
  id,
  catalogue,
  refreshing,
  onRefresh,
}: {
  /** Describes the picker: the line or the heading carries it. */
  id: string;
  catalogue: StartCatalogue;
  refreshing: boolean;
  /** Reads the catalogue again (discovery and the sign-in checks run again). */
  onRefresh?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const text = useMessage();
  const [open, setOpen] = useState(false);
  const summary = agentAvailability(catalogue);
  if (summary.kind === 'all') {
    return null;
  }

  const { unavailable, onlyUndetermined } = summary;
  const details = (primary: boolean) => (
    <Button
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
    />
  );

  if (summary.kind !== 'some') {
    const undetermined = summary.kind === 'undetermined';

    return (
      <>
        <div className="grid gap-3">
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
            {undetermined ? details(false) : checkAgain(false)}
          </div>
        </div>
        {panel}
      </>
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
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <InlineNote
          tone={onlyUndetermined ? 'info' : 'attention'}
          icon={onlyUndetermined ? 'clock' : undefined}
          className="min-w-0"
        >
          <span id={id}>{line}</span>
        </InlineNote>
        <div className="flex items-center gap-2">
          {onlyUndetermined && checkAgain(false)}
          {details(false)}
        </div>
      </div>
      {panel}
    </>
  );
}
