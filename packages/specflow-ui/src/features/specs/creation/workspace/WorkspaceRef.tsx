import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { useMessage } from '../../../../i18n/message';
import { BranchRef } from './BranchRef';
import { noBranchLabel } from './model/workspaceCopy';

/** Names a workspace by its branch; a workspace without one has no value to show. */
export function WorkspaceLabel({
  workspace,
  truncate = false,
}: {
  workspace: CreateOptions['workspaces'][number];
  /** One line with an ellipsis (Select); the searchable list wraps so similar names stay distinct. */
  truncate?: boolean;
}) {
  const text = useMessage();

  return workspace.branch ? (
    <BranchRef name={workspace.branch} truncate={truncate} />
  ) : (
    <span className={truncate ? 'truncate' : undefined}>{text(noBranchLabel)}</span>
  );
}

/**
 * A workspace as a merge target: its name (the checkout folder) as the primary text and its branch as the secondary chip.
 */
export function WorkspaceRef({
  workspace,
  truncate = false,
}: {
  workspace: Pick<CreateOptions['workspaces'][number], 'name' | 'branch'>;
  truncate?: boolean;
}) {
  const text = useMessage();

  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={truncate ? 'truncate' : undefined}>{workspace.name}</span>{' '}
      {workspace.branch ? (
        <BranchRef name={workspace.branch} truncate={truncate} />
      ) : (
        <span className="text-content-muted">{text(noBranchLabel)}</span>
      )}
    </span>
  );
}
