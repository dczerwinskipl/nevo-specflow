import { useTranslation } from 'react-i18next';
import { Icon } from '@nevo/ui';
import type { GateStatus } from '@nevo/specflow-contracts/workflow';
import { gateDetail } from './presentation';
import { InlineAction } from './InlineAction';

/** The action that resolves an unmet gate, when the page offers one (Create findings document). */
export interface GateAction {
  readonly label: string;
  readonly onSelect: () => void;
  /** What to do to finish, when this is the main action ("Add the Acceptance section to …"). */
  readonly hint?: string;
}

/**
 * Gates as a checklist: met ones as satisfied checks, unmet ones with what is missing and, where
 * one exists, the action that resolves them. Each icon sits on the first line of its text.
 *
 * `blocking` (default) is for a list beside the action the gates refuse now (the chosen result of
 * Finish step, a start): an unmet gate takes the attention tone and says what is missing.
 * `checklist` is Now's "Done when": the step is still being worked on, so an unmet gate is an open
 * item, neutral: "not yet", and the missing sections when its document lacks some ("not yet ·
 * missing Verification"). A gate that cannot be met as things are (its file is missing or
 * unreadable) still says why.
 */
export function GateList({
  gates,
  label,
  actionFor,
  documentFor,
  variant = 'blocking',
}: {
  readonly gates: readonly GateStatus[];
  readonly label: string;
  readonly actionFor?: (gate: GateStatus) => GateAction | undefined;
  /** Names the document that meets a satisfied gate (`findings.md`). */
  readonly documentFor?: (gate: GateStatus) => string | undefined;
  readonly variant?: 'blocking' | 'checklist';
}) {
  const { t } = useTranslation();
  const checklist = variant === 'checklist';

  return (
    <ul aria-label={label} className="grid gap-1.5">
      {gates.map((gate) => {
        const met = gate.status === 'satisfied';
        const open =
          checklist && (gate.reason === 'no-document' || gate.reason === 'sections-missing');
        const detail = met
          ? documentFor?.(gate)
          : open
            ? gate.reason === 'sections-missing' && (gate.missingSections ?? []).length > 0
              ? t('workflowExecution.gate.notYetSections', {
                  sections: (gate.missingSections ?? []).join(', '),
                })
              : t('workflowExecution.gate.notYet')
            : gateDetail(t, gate);
        const action = met ? undefined : actionFor?.(gate);

        return (
          <li
            key={gate.id}
            className="flex min-w-0 items-start gap-2 text-body-sm text-content-secondary"
          >
            <span className="flex h-[1lh] shrink-0 items-center">
              <Icon
                name={met ? 'circle-check' : checklist ? 'circle' : 'circle-alert'}
                size="sm"
                aria-hidden="true"
                className={
                  met
                    ? 'text-status-success'
                    : checklist
                      ? 'text-content-muted'
                      : 'text-status-attention'
                }
              />
            </span>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="font-medium text-content-primary">{gate.label}</span>
              {detail ? (
                <span className={open ? 'text-content-muted' : undefined}>{` · ${detail}`}</span>
              ) : null}
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
