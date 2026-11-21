import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { InlineNote } from '@nevo/ui';
import type { ProjectHold } from '@nevo/specflow-contracts/workflow';
import { SessionLink } from './AgentSession';

const STRONG = 'font-medium text-content-primary';

/** The subject that holds the project, as a link to its page where a router exists. */
function SubjectLink({ hold }: { readonly hold: ProjectHold }) {
  const router = useRouter({ warn: false });
  const { specId, taskId, title } = hold.subject;
  if (!router) {
    return <span className={STRONG}>{title}</span>;
  }

  const className = 'text-content-link underline-offset-2 hover:underline';

  return taskId === undefined ? (
    <Link
      to="/specs/$specId"
      params={{ specId }}
      search={{ collection: 'current' }}
      className={className}
    >
      {title}
    </Link>
  ) : (
    <Link
      to="/specs/$specId/tasks/$taskId"
      params={{ specId, taskId }}
      search={{ collection: 'current' }}
      className={className}
    >
      {title}
    </Link>
  );
}

/**
 * Another subject's agent holds the project (`projectHold`, workflow-execution.md "Every other
 * subject"). While its outcome is unknown nothing can be saved anywhere: an attention alert that
 * names the subject (a link, where Check outcome is) and its Session. While it merely works, a
 * lighter note, shown only where this block has an action that would wait for it.
 */
export function ProjectHoldNote({
  hold,
  hasAction,
}: {
  readonly hold: ProjectHold;
  /** The block offers an action the hold would refuse. */
  readonly hasAction: boolean;
}) {
  const { t } = useTranslation();
  const session = (
    <>
      {' '}
      {t('workflowExecution.projectHold.session')}{' '}
      <SessionLink
        sessionId={hold.sessionId}
        title={t('workflowExecution.agentAttempt.sessionFallback')}
      />
    </>
  );
  if (hold.kind === 'agent-outcome-unknown') {
    return (
      <InlineNote tone="attention" role="alert" data-project-hold={hold.kind}>
        <span className={STRONG}>{t('workflowExecution.projectHold.unknown.title')}</span>{' '}
        {t('workflowExecution.projectHold.unknown.body')} <SubjectLink hold={hold} />
        {session}
      </InlineNote>
    );
  }

  return hasAction ? (
    <InlineNote tone="info" role="status" data-project-hold={hold.kind}>
      {t('workflowExecution.projectHold.working.body')} <SubjectLink hold={hold} />
      {session}
    </InlineNote>
  ) : null;
}
