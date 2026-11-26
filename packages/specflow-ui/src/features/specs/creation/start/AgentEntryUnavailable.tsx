import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@nevo/ui';
import { formatList } from '../../../../i18n/formatList';
import { useMessage } from '../../../../i18n/message';
import { TextAction } from '../../../../shared/actions/TextAction';
import {
  AgentDiagnosisPanel,
  agentAvailability,
  agentStatusText,
  recheckCanHelp,
} from '../../../sessions';
import type { AgentCatalogue } from '../../../tasks';

/** "CLI not found" keeps its acronym; "Needs sign-in" reads "needs sign-in" after a colon. */
function lowerFirst(value: string) {
  return /^.\p{Ll}/u.test(value) ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

/**
 * Why no agent can start, under the disabled "With an agent" tile: one short line naming each agent
 * and what stops it, then **How to fix** (the Session start screen's diagnosis panel) and **Check
 * again**. Undefined when an agent can start (or while that is still being read): the tile is usable.
 */
export function agentEntryUnavailable(agents: AgentCatalogue): 'none' | 'failed' | undefined {
  if (agents.status === 'error') {
    return 'failed';
  }

  if (agents.status !== 'ready') {
    return undefined;
  }

  const summary = agentAvailability(agents.catalogue);

  return summary.kind === 'all' || summary.kind === 'some' ? undefined : 'none';
}

export function AgentEntryUnavailable({
  agents,
  refreshing,
  onRefresh,
}: {
  agents: AgentCatalogue;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const text = useMessage();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const summary = agents.status === 'ready' ? agentAvailability(agents.catalogue) : undefined;
  const unavailable =
    summary && summary.kind !== 'all' && summary.kind !== 'empty' ? summary.unavailable : [];
  const demo = agents.status === 'ready' && agents.catalogue.demo;
  const line =
    agents.status === 'error'
      ? t('create.start.agentUnavailable.failed')
      : summary?.kind === 'empty'
        ? t('create.start.agentUnavailable.empty')
        : t('create.start.agentUnavailable.none', {
            reasons: formatList(
              unavailable.map((provider) =>
                t('sessionStart.diagnostics.oneUnavailable', {
                  provider: provider.title,
                  status: lowerFirst(agentStatusText(provider, demo, text)),
                }),
              ),
              i18n.resolvedLanguage,
            ),
          });
  const recheck =
    agents.status !== 'ready' || unavailable.length === 0 || unavailable.some(recheckCanHelp);

  return (
    <div role="status" className="grid gap-1">
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        {line}
      </Typography>
      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-body-sm">
        {unavailable.length > 0 && (
          <TextAction ref={trigger} aria-haspopup="dialog" onClick={() => setOpen(true)}>
            {t('sessionStart.diagnostics.howToFix')}
          </TextAction>
        )}
        {recheck && (
          <TextAction disabled={refreshing} aria-busy={refreshing || undefined} onClick={onRefresh}>
            {t('sessionStart.diagnostics.checkAgain')}
          </TextAction>
        )}
      </p>
      {unavailable.length > 0 && (
        <AgentDiagnosisPanel
          open={open}
          onOpenChange={setOpen}
          agents={unavailable}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}
