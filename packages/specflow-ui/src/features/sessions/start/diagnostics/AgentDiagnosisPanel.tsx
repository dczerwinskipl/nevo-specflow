import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Collapsible,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Icon,
  SegmentedControl,
  Typography,
  cn,
  useWorkspaceLayout,
} from '@nevo/ui';
import { message, useMessage } from '../../../../i18n/message';
import type { StartProvider } from '../catalogue/startCatalogue';
import type { ProviderDiagnosis } from '../catalogue/providerDiagnosis';
import { onlyRestartHelps, recheckCanHelp } from './agentAvailability';
import { CodeBlock, DiagnosisMessage } from './DiagnosisText';
import { AgentStatusGlyph, agentStatusText } from './agentStatus';

/**
 * How to fix the agents that cannot start: a side panel on the split layout, a bottom sheet on a
 * phone. One agent: its name is the title and its status the description. Several: a segmented
 * control switches between them. Only the body scrolls; the header and the footer stay. The footer
 * offers **Check again** only when a fix can be seen by it; when every fix needs a restart it says
 * so instead (the UI cannot restart the Runtime).
 */
export function AgentDiagnosisPanel({
  open,
  onOpenChange,
  agents,
  refreshing,
  onRefresh,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The agents that cannot start, in the picker's order. */
  agents: readonly StartProvider[];
  refreshing: boolean;
  onRefresh?: () => void;
  /** Where focus goes when the panel closes (or goes away with the last agent it explained). */
  onCloseAutoFocus: (event: Event) => void;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const isSplit = useWorkspaceLayout().mode === 'split';
  const [selectedId, setSelectedId] = useState(agents[0]?.id ?? '');
  // An agent that became available on a recheck leaves the list; the first one left takes over.
  const selected = agents.find((agent) => agent.id === selectedId) ?? agents[0];
  if (!selected) {
    return null;
  }

  const single = agents.length === 1;
  const status = agentStatusText(selected, false, text);
  const canRecheck = recheckCanHelp(selected);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        side={isSplit ? 'right' : 'bottom'}
        closeLabel={t('common.close')}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DrawerHeader>
          <DrawerTitle>
            {single ? selected.title : t('sessionStart.diagnostics.howToFix')}
          </DrawerTitle>
          {!single && (
            <SegmentedControl
              aria-label={t('sessionStart.agent.heading')}
              className="mt-3 w-full"
              value={selected.id}
              onValueChange={setSelectedId}
            >
              {agents.map((agent) => (
                <SegmentedControl.Item key={agent.id} value={agent.id}>
                  {agent.title}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl>
          )}
          <DrawerDescription className={cn('flex items-center gap-1.5', !single && 'mt-3')}>
            <AgentStatusGlyph provider={selected} />
            {status}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <DiagnosisBody key={selected.id} diagnosis={selected.diagnosis} />
        </DrawerBody>
        {(canRecheck || onlyRestartHelps(selected)) && (
          <DrawerFooter>
            {canRecheck ? (
              onRefresh && (
                <Button
                  type="button"
                  className="w-full sm:w-fit"
                  disabled={refreshing}
                  aria-busy={refreshing || undefined}
                  onClick={onRefresh}
                >
                  {t('sessionStart.diagnostics.checkAgain')}
                </Button>
              )
            ) : (
              // Nothing here can be seen by a recheck: no button, the restart is the next step.
              <div className="flex items-start gap-2">
                <span className="flex h-5 items-center">
                  <Icon name="info" size="sm" aria-hidden="true" className="text-content-muted" />
                </span>
                <DiagnosisMessage value={message('sessionStart.diagnostics.thenRestart')} />
              </div>
            )}
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function DiagnosisBody({ diagnosis }: { diagnosis: ProviderDiagnosis | undefined }) {
  const { t } = useTranslation();
  const text = useMessage();
  if (!diagnosis) {
    return null;
  }

  const { detail, found, executable, checkedPaths, fixes } = diagnosis;
  // Each fix says how it is applied, unless every one needs a restart: the footer then says it once.
  const perFixHow = fixes.some((fix) => fix.applies === 'recheck');

  return (
    <div className="grid min-w-0 gap-5">
      {[detail, found, executable, checkedPaths].some(Boolean) && (
        <div className="grid gap-2">
          {detail && (
            <Typography as="p" variant="body-sm" className="text-content-secondary">
              {detail}
            </Typography>
          )}
          {found && <DiagnosisMessage value={found} />}
          {executable && (
            <Typography
              as="p"
              variant="body-sm"
              className="text-content-muted [overflow-wrap:anywhere]"
            >
              {text(executable)}
            </Typography>
          )}
          {checkedPaths && (
            <Collapsible density="inline" className="text-body-sm text-content-secondary">
              <Collapsible.Trigger>
                {t('sessionStart.diagnostics.checkedPaths', { total: checkedPaths.length })}
              </Collapsible.Trigger>
              <Collapsible.Content>
                <ul className="mt-2 grid gap-1.5">
                  {checkedPaths.map((path) => (
                    <li key={path} className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">
                      {path}
                    </li>
                  ))}
                </ul>
              </Collapsible.Content>
            </Collapsible>
          )}
        </div>
      )}
      {fixes.map((fix, index) => (
        <section
          key={index}
          className="grid min-w-0 gap-2"
          aria-label={fix.title ? text(fix.title) : undefined}
        >
          {fix.title && (
            <Typography as="h3" variant="label-md" className="text-content-primary">
              {text(fix.title)}
            </Typography>
          )}
          <DiagnosisMessage value={fix.text} />
          {fix.code && <CodeBlock file={fix.code.file}>{fix.code.body}</CodeBlock>}
          {perFixHow && (
            <div className="flex items-start gap-2">
              <span className="flex h-5 items-center">
                <Icon
                  name={fix.applies === 'recheck' ? 'refresh' : 'info'}
                  size="sm"
                  aria-hidden="true"
                  className="text-content-muted"
                />
              </span>
              <DiagnosisMessage
                value={message(
                  fix.applies === 'recheck'
                    ? 'sessionStart.diagnostics.thenRecheck'
                    : 'sessionStart.diagnostics.thenRestart',
                )}
              />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
