import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Typography } from '@nevo/ui';
import type { RepositoryBlocker } from '@nevo/specflow-contracts/specs';

type Checkout = 'specification' | 'integration-target';

const checkoutName = (t: TFunction, checkout: Checkout) =>
  checkout === 'specification'
    ? t('workflowExecution.close.repository.checkout.specification')
    : t('workflowExecution.close.repository.checkout.integrationTarget');

/**
 * The clause of a repository precondition in the "cannot close yet: …" sentence of the Close dialog
 * (`closeReasons` lists the workflow clauses before them).
 */
export function repositoryReasons(
  t: TFunction,
  repository: readonly RepositoryBlocker[],
): string[] {
  return repository.map((blocker) => {
    switch (blocker.kind) {
      case 'uncommitted-changes':
        return t('workflowExecution.close.repository.reason.uncommitted', {
          checkout: checkoutName(t, blocker.checkout),
        });
      case 'integration-target-missing':
        return t('workflowExecution.close.repository.reason.targetMissing');
      case 'integration-target-branch':
        return t('workflowExecution.close.repository.reason.targetBranch', {
          expected: blocker.expectedBranch,
        });
      case 'git-operation-in-progress':
        return t('workflowExecution.close.repository.reason.gitOperation', {
          checkout: checkoutName(t, blocker.checkout),
        });
      case 'branch-detached':
        return t('workflowExecution.close.repository.reason.detached', {
          checkout: checkoutName(t, blocker.checkout),
        });
    }
  });
}

function copyOf(t: TFunction, blocker: RepositoryBlocker): { title: string; explanation: string } {
  switch (blocker.kind) {
    case 'uncommitted-changes':
      return {
        title: t('workflowExecution.exit.groupHeading', {
          title: t('workflowExecution.close.repository.uncommitted.title'),
          count: blocker.count,
        }),
        explanation:
          blocker.checkout === 'specification'
            ? t('workflowExecution.close.repository.uncommitted.specification')
            : t('workflowExecution.close.repository.uncommitted.integrationTarget'),
      };
    case 'integration-target-missing':
      return {
        title: t('workflowExecution.close.repository.targetMissing.title'),
        explanation: t('workflowExecution.close.repository.targetMissing.explanation'),
      };
    case 'integration-target-branch':
      return {
        title: t('workflowExecution.close.repository.targetBranch.title'),
        explanation: t('workflowExecution.close.repository.targetBranch.explanation', {
          expected: blocker.expectedBranch,
          branch: blocker.branch,
        }),
      };
    case 'git-operation-in-progress':
      return {
        title: t('workflowExecution.close.repository.gitOperation.title'),
        explanation: t('workflowExecution.close.repository.gitOperation.explanation', {
          checkout: checkoutName(t, blocker.checkout),
        }),
      };
    case 'branch-detached':
      return {
        title: t('workflowExecution.close.repository.detached.title'),
        explanation: t('workflowExecution.close.repository.detached.explanation', {
          checkout: checkoutName(t, blocker.checkout),
        }),
      };
  }
}

/**
 * The repository preconditions that keep a Close from starting, in the shape of the workflow
 * blocker groups: each one says what holds the Close, why, and what to do in the repository.
 */
export function RepositoryBlockers({
  repository,
}: {
  readonly repository: readonly RepositoryBlocker[];
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-5">
      {repository.map((blocker, index) => {
        const { title, explanation } = copyOf(t, blocker);
        const paths = blocker.kind === 'uncommitted-changes' ? blocker.paths : [];
        const more = blocker.kind === 'uncommitted-changes' ? blocker.count - paths.length : 0;

        return (
          <section key={`${blocker.kind}-${index}`} className="grid gap-2" aria-label={title}>
            <div className="grid gap-0.5">
              <Typography as="h3" variant="label-sm">
                {title}
              </Typography>
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {explanation}
              </Typography>
            </div>
            {paths.length > 0 ? (
              <ul className="grid gap-1 text-body-sm">
                {paths.map((path) => (
                  <li key={path} className="min-w-0 font-mono [overflow-wrap:anywhere]">
                    {path}
                  </li>
                ))}
                {more > 0 ? (
                  <li className="text-content-muted">
                    {t('workflowExecution.exit.more', { count: more })}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
