import { useTranslation } from 'react-i18next';
import { Icon } from '@nevo/ui';
import type { GateStatus } from '@nevo/specflow-contracts/workflow';
import { gateDetail } from './presentation';
import { InlineAction } from './InlineAction';

/** The action that resolves an unmet gate, when the page offers one (Create findings document). */
export interface GateAction {
  readonly label: string;
  readonly onSelect: () => void;
}

/**
 * Gates as a checklist: met ones as satisfied checks, unmet ones with what is missing and, where
 * one exists, the action that resolves them. Each icon sits on the first line of its text.
 */
export function GateList({
  gates,
  label,
  actionFor,
}: {
  readonly gates: readonly GateStatus[];
  readonly label: string;
  readonly actionFor?: (gate: GateStatus) => GateAction | undefined;
}) {
  const { t } = useTranslation();

  return (
    <ul aria-label={label} className="grid gap-1.5">
      {gates.map((gate) => {
        const met = gate.status === 'satisfied';
        const detail = gateDetail(t, gate);
        const action = met ? undefined : actionFor?.(gate);

        return (
          <li
            key={gate.id}
            className="flex min-w-0 items-start gap-2 text-body-sm text-content-secondary"
          >
            <span className="flex h-[1lh] shrink-0 items-center">
              <Icon
                name={met ? 'circle-check' : 'circle-alert'}
                size="sm"
                aria-hidden="true"
                className={met ? 'text-status-success' : 'text-status-attention'}
              />
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="font-medium text-content-primary">{gate.label}</span>
              {detail ? ` · ${detail}` : null}
              <span className="sr-only">
                {met
                  ? t('workflowExecution.gate.metHidden')
                  : t('workflowExecution.gate.unmetHidden')}
              </span>
              {action ? (
                <>
                  {' '}
                  <InlineAction className="ml-1" onClick={action.onSelect}>
                    {action.label}
                  </InlineAction>
                </>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
