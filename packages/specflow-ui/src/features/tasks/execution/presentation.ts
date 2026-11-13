import type { TFunction } from 'i18next';
import type { GateStatus, WorkflowActor } from '@nevo/specflow-contracts/workflow';

/**
 * Who acted, as recorded: a person by the id the Runtime recorded (without the `local:` prefix of a
 * Runtime without authentication), an agent by its provider and model.
 */
export function actorLabel(actor: WorkflowActor): string {
  if (actor.class === 'human') {
    return actor.details.actorId.replace(/^local:/, '');
  }

  return [actor.details.provider, actor.details.model].filter(Boolean).join(' · ');
}

/** A recorded time, short and in the reader's locale; an unreadable value is shown as it is. */
export function formatWhen(at: string, locale: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) {
    return at;
  }

  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** What an unmet gate is missing, in one clause (`· none registered yet`). */
export function gateDetail(t: TFunction, gate: GateStatus): string | undefined {
  if (gate.status === 'satisfied') {
    return undefined;
  }

  switch (gate.reason) {
    case 'no-document':
      return t('workflowExecution.gate.noDocument');
    case 'file-missing':
      return t('workflowExecution.gate.fileMissing');
    case 'sections-missing':
      return t('workflowExecution.gate.sectionsMissing', {
        sections: (gate.missingSections ?? []).join(', '),
      });
    case 'unreadable':
      return t('workflowExecution.gate.unreadable');
    default:
      return undefined;
  }
}
