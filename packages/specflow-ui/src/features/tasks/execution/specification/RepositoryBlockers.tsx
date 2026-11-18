import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { InlineNote, Typography } from '@nevo/ui';
import type { RepositoryBlocker } from '@nevo/specflow-contracts/specs';
import { useWorkspaces } from '../../../workspaces/read-model';
import { CopyAction } from './CopyAction';
import { IntegrationBranchChoice } from './IntegrationBranchChoice';

type Checkout = 'specification' | 'integration-target';
type Uncommitted = Extract<RepositoryBlocker, { kind: 'uncommitted-changes' }>;

const checkoutName = (t: TFunction, checkout: Checkout) =>
  checkout === 'specification'
    ? t('workflowExecution.close.repository.checkout.specification')
    : t('workflowExecution.close.repository.checkout.integrationTarget');

function Group({
  heading,
  explanation,
  children,
}: {
  readonly heading: string;
  readonly explanation?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-2" aria-label={heading}>
      <div className="grid gap-0.5">
        <Typography as="h3" variant="label-sm">
          {heading}
        </Typography>
        {explanation ? (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {explanation}
          </Typography>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const MONO = 'font-mono text-content-primary [overflow-wrap:anywhere]';

/**
 * Files not committed in a checkout the Close needs clean: the files (at most five, the
 * specification's own first and marked, then "and N more"), committing them as the way forward, the checkout's path to copy (when it can be read),
 * and the warning that
 * discarding loses them for good. The dialog never offers to discard.
 */
function UncommittedFiles({
  blocker,
  specTitle,
}: {
  readonly blocker: Uncommitted;
  readonly specTitle: string;
}) {
  const { t } = useTranslation();
  const shown = blocker.paths.slice(0, UNCOMMITTED_PATHS_SHOWN);
  const more = blocker.count - shown.length;
  const own = blocker.checkout === 'specification';

  return (
    <Group
      heading={t('workflowExecution.exit.groupHeading', {
        title: own
          ? t('workflowExecution.close.repository.uncommitted.titleSpecification')
          : t('workflowExecution.close.repository.uncommitted.titleIntegrationTarget'),
        count: blocker.count,
      })}
      explanation={
        own
          ? t('workflowExecution.close.repository.uncommitted.leadSpecification')
          : t('workflowExecution.close.repository.uncommitted.leadIntegrationTarget', {
              title: specTitle,
            })
      }
    >
      <ul className="grid list-disc gap-0.5 pl-5 text-body-sm marker:text-content-muted">
        {/* The specification's own files come first; the label tells them from the others. */}
        {shown.map(({ path, scope }) => (
          <li key={path}>
            <span className={MONO}>{path}</span>
            {scope === 'specification' ? (
              <span className="text-content-muted">
                {' '}
                {t('workflowExecution.close.repository.uncommitted.ofSpecification')}
              </span>
            ) : null}
          </li>
        ))}
        {more > 0 ? (
          <li className="list-none text-content-muted">
            {t('workflowExecution.exit.more', { count: more })}
          </li>
        ) : null}
      </ul>
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        {own
          ? t('workflowExecution.close.repository.uncommitted.commitSpecification')
          : t('workflowExecution.close.repository.uncommitted.commitIntegrationTarget')}
      </Typography>
      <CheckoutPath workspaceId={blocker.workspaceId} />
      <InlineNote tone="attention">
        <strong className="font-medium">
          {t('workflowExecution.close.repository.uncommitted.discardWarningLead')}
        </strong>{' '}
        {t('workflowExecution.close.repository.uncommitted.discardWarning')}
      </InlineNote>
    </Group>
  );
}

/**
 * Where the checkout is, with Copy path: its path comes from the registered workspaces
 * (`GET /api/workspaces`, `workspace.view`), never from the Close refusal. Without that read (no
 * capability, or it failed) the sentence above names the checkout and there is nothing to copy.
 */
function CheckoutPath({ workspaceId }: { readonly workspaceId: string }) {
  const { t } = useTranslation();
  const workspace = useWorkspaces().data?.workspaces.find(
    (candidate) => candidate.workspaceId === workspaceId,
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

/** At most this many uncommitted files are named; the rest are counted. */
export const UNCOMMITTED_PATHS_SHOWN = 5;

function SimpleBlocker({ blocker }: { readonly blocker: RepositoryBlocker }) {
  const { t } = useTranslation();
  switch (blocker.kind) {
    case 'integration-target-branch':
      return (
        <Group
          heading={t('workflowExecution.close.repository.targetBranch.title')}
          explanation={t('workflowExecution.close.repository.targetBranch.explanation', {
            expected: blocker.expectedBranch,
            branch: blocker.branch,
          })}
        />
      );
    case 'git-operation-in-progress':
      return (
        <Group
          heading={t('workflowExecution.close.repository.gitOperation.title')}
          explanation={t('workflowExecution.close.repository.gitOperation.explanation', {
            checkout: checkoutName(t, blocker.checkout),
          })}
        />
      );
    case 'branch-detached':
      return (
        <Group
          heading={t('workflowExecution.close.repository.detached.title')}
          explanation={t('workflowExecution.close.repository.detached.explanation', {
            checkout: checkoutName(t, blocker.checkout),
          })}
        />
      );
    default:
      return null;
  }
}

/**
 * The repository preconditions that keep a Close from starting, as flat groups beside the workflow
 * ones: each says what holds the Close, why, and what to do in the repository; a missing
 * integration branch offers the candidates to choose from ({@link IntegrationBranchChoice}).
 */
export function RepositoryBlockers({
  repository,
  specTitle,
}: {
  readonly repository: readonly RepositoryBlocker[];
  readonly specTitle: string;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      {repository.map((blocker, index) => {
        const key = `${blocker.kind}-${index}`;
        switch (blocker.kind) {
          case 'uncommitted-changes':
            return <UncommittedFiles key={key} blocker={blocker} specTitle={specTitle} />;
          case 'integration-target-missing':
            return <IntegrationBranchChoice key={key} blocker={blocker} specTitle={specTitle} />;
          default:
            return <SimpleBlocker key={key} blocker={blocker} />;
        }
      })}
    </div>
  );
}
