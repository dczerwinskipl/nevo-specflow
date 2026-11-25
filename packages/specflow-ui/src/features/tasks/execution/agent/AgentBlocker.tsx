import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@nevo/ui';
import { useWorkspaces } from '../../../workspaces/read-model';
import { CopyAction } from '../specification/CopyAction';
import { MODEL_NOT_OFFERED, NO_AGENT_REASONS, type UnavailableAgent } from './agentOption';

const MONO = 'font-mono text-content-primary [overflow-wrap:anywhere]';
/** At most this many changed files are named, as the Close dialog lists them; the rest are counted. */
const PATHS_SHOWN = 5;

/** The checkout's folder with Copy path, when the registered workspaces name it (`workspace.view`). */
function CheckoutPath({ specId }: { readonly specId: string }) {
  const { t } = useTranslation();
  const workspace = useWorkspaces().data?.workspaces.find((candidate) =>
    candidate.specifications.some((specification) => specification.specId === specId),
  );
  if (!workspace) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-body-sm">
      <span className={MONO}>{workspace.path}</span>
      <CopyAction text={workspace.path} label={t('workflowExecution.close.repository.copyPath')} />
    </div>
  );
}

/** The blocker an unavailable agent option is explained by (`workflowExecution.agent.blocker.*`). */
export function blockerKeyOf(option: UnavailableAgent): string {
  if (option.reason === 'dirty-baseline') {
    return 'dirty';
  }

  if (option.reason === 'owner-work-uncommitted') {
    return 'ownerWork';
  }

  if ((NO_AGENT_REASONS as readonly string[]).includes(option.reason)) {
    return 'noAgent';
  }

  if ((option.reason as string) === MODEL_NOT_OFFERED) {
    return 'modelNotOfferedSettings';
  }

  const keys: Partial<Record<UnavailableAgent['reason'], string>> = {
    'provider-not-ready': 'providerNotReady',
    'session-unavailable': 'sessionUnavailable',
    'project-busy': 'projectBusy',
    demo: 'demo',
  };

  return keys[option.reason] ?? 'other';
}

export function Paths({ option }: { readonly option: UnavailableAgent }) {
  const { t } = useTranslation();
  const paths = option.paths ?? [];
  const shown = paths.slice(0, PATHS_SHOWN);
  const more = (option.count ?? paths.length) - shown.length;

  return (
    <ul className="grid list-disc gap-0.5 pl-5 text-body-sm marker:text-content-muted">
      {shown.map((path) => (
        <li key={path} className={MONO}>
          {path}
        </li>
      ))}
      {more > 0 ? (
        <li className="list-none text-content-muted">
          {t('workflowExecution.agent.blocker.dirty.more', { count: more })}
        </li>
      ) : null}
    </ul>
  );
}

/**
 * What blocks the start, as one attention Alert: what, why and what to do, with the action that
 * resolves it (Check again) inside the alert, never in the dialog footer. The Runtime's plain
 * `detail` (which provider is not ready and why, who holds the project) is shown as it is.
 * `urgent` is a refusal of a start just sent (`role="alert"`); before that the explanation is a status.
 */
export function AgentBlocker({
  option,
  specId,
  step,
  role,
  checking,
  onCheckAgain,
  urgent = false,
}: {
  readonly option: UnavailableAgent;
  readonly specId: string;
  readonly step: string;
  /** The agent role's name ("Implementer agent"); absent when the Runtime names none. */
  readonly role: string | undefined;
  readonly checking: boolean;
  readonly onCheckAgain: () => void;
  readonly urgent?: boolean;
}) {
  const { t } = useTranslation();
  const values = { step, role, startLabel: t('workflowExecution.now.start', { step }) };
  const unnamed = role === undefined;
  let key: string;
  let extra: ReactNode = null;
  let detail = false;
  let needsCheck = true;
  if (option.reason === 'dirty-baseline' || option.reason === 'owner-work-uncommitted') {
    key = option.reason === 'dirty-baseline' ? 'dirty' : 'ownerWork';
    extra = (
      <>
        <Paths option={option} />
        <CheckoutPath specId={specId} />
      </>
    );
  } else if ((NO_AGENT_REASONS as readonly string[]).includes(option.reason)) {
    key = 'noAgent';
  } else if (option.reason === 'provider-not-ready') {
    key = 'providerNotReady';
    detail = true;
  } else if ((option.reason as string) === MODEL_NOT_OFFERED) {
    // Its `detail` names the configured model id: never shown (owner, 2026-11-25).
    key = 'modelNotOfferedSettings';
  } else if (option.reason === 'session-unavailable') {
    key = 'sessionUnavailable';
  } else if (option.reason === 'project-busy') {
    key = 'projectBusy';
    detail = true;
  } else if (option.reason === 'demo') {
    key = 'demo';
    needsCheck = false;
  } else {
    key = 'other';
  }

  const base = `workflowExecution.agent.blocker.${key}` as const;

  return (
    <Alert
      role={urgent ? 'alert' : 'status'}
      tone="attention"
      title={t(`${base}.title` as 'workflowExecution.agent.blocker.dirty.title', values)}
    >
      <div className="grid gap-2">
        <p>
          {detail && option.detail
            ? option.detail
            : urgent && key === 'providerNotReady'
              ? t('workflowExecution.agent.blocker.providerNotReady.bodyRefused', values)
              : t(
                  `${base}.body${key === 'noAgent' && unnamed ? 'Unnamed' : ''}` as 'workflowExecution.agent.blocker.dirty.body',
                  values,
                )}
        </p>
        {extra}
        <p>
          {t(
            `${base}.hint${key === 'noAgent' && unnamed ? 'Unnamed' : ''}` as 'workflowExecution.agent.blocker.dirty.hint',
            values,
          )}
        </p>
        {needsCheck ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="secondary"
              leadingIcon="refresh"
              onClick={onCheckAgain}
              disabled={checking}
              aria-busy={checking}
            >
              {checking
                ? t('workflowExecution.agent.checkingAgain')
                : t('workflowExecution.agent.checkAgain')}
            </Button>
          </div>
        ) : null}
      </div>
    </Alert>
  );
}
