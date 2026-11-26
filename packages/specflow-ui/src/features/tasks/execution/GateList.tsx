import { useTranslation } from 'react-i18next';
import { Icon } from '@nevo/ui';
import type { GateStatus } from '@nevo/specflow-contracts/workflow';
import { useMessage } from '../../../i18n/message';
import { gateLine } from '../../documents';
import { TextAction } from '../../../shared/actions';

/** The action that resolves an unmet gate, when the page offers one (Create findings document). */
export interface GateAction {
  readonly label: string;
  readonly onSelect: () => void;
  /** What to do to finish, when this is the main action ("Add the Acceptance section to …"). */
  readonly hint?: string;
}

/**
 * Gates as a checklist: met ones as satisfied checks, unmet ones with what is missing and, where
 * one exists, the action that resolves them. Each icon sits on the first line of its text. The
 * words are the same in every list ({@link gateLine}): "behaviour.md has an Acceptance section ·
 * not yet"; only the tone differs.
 *
 * `blocking` (default) is for a list beside the action the gates refuse now (the chosen result of
 * Finish step, a start): an unmet gate takes the attention tone. `checklist` is Now's "Done when":
 * the step is still being worked on, so an open item (no document yet, sections still to write) is
 * neutral. A gate that cannot be met as things are (its file is missing or unreadable) says why.
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
  /** The file name of the gate's document (`behaviour.md`), when the page knows it. */
  readonly documentFor?: (gate: GateStatus) => string | undefined;
  readonly variant?: 'blocking' | 'checklist';
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const checklist = variant === 'checklist';

  return (
    <ul aria-label={label} className="grid gap-1.5">
      {gates.map((gate) => {
        const met = gate.status === 'satisfied';
        const name = documentFor?.(gate);
        const line = gateLine(gate, name);
        const open = checklist && line.open;
        // A met gate names the document that meets it, unless its label does already.
        const detail = met
          ? line.namesDocument
            ? undefined
            : name
          : line.detail
            ? text(line.detail)
            : undefined;
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
              <span className="font-medium text-content-primary">{text(line.label)}</span>
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
                  <TextAction className="ml-1" onClick={action.onSelect}>
                    {action.label}
                  </TextAction>
                </>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
