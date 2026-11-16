import {
  CloseOperationError,
  previewPublicCloseOperation,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

type PreviewRequest = Parameters<typeof previewPublicCloseOperation>[1] & {
  readonly kind: 'worktree-close' | 'specification-close';
  readonly specId: string;
};
type Blocker = CloseOperationError['blockers'][number];

/**
 * The agent Session blocker of the linked checkout a Close would remove, asked from the same host
 * quiescence port Close asks before it starts (`session-turn-running`). Nothing for an archive-only
 * Close or the primary checkout, which Close never removes.
 */
async function checkoutOccupancy(
  engine: SpecFlowEngine,
  request: PreviewRequest,
): Promise<Blocker | undefined> {
  if (request.kind === 'specification-close' && request.integrateToTargetBranch === false) {
    return undefined;
  }

  const registry = await engine.readRegistry();
  const workspaceId = registry.specBindings.find(
    (binding) => binding.specId === request.specId,
  )?.workspaceId;
  const workspace = registry.workspaces.find((item) => item.workspaceId === workspaceId);
  if (workspace?.kind !== 'linked') {
    return undefined;
  }

  const verdict = engine.checkoutQuiescence
    ? await engine.checkoutQuiescence({ workspaceId: workspace.workspaceId, root: workspace.root })
    : {
        quiet: false as const,
        sessionIds: [],
        message: 'This process cannot tell whether an agent Session works in the worktree.',
      };

  return verdict.quiet
    ? undefined
    : {
        kind: 'session-turn-running',
        subjectIds: [...verdict.sessionIds],
        message: verdict.message,
      };
}

/**
 * `specs close --preview` and `specs worktree close --preview`: the read-only plan, refused with
 * `CLOSE_BLOCKED` exactly where Close would refuse, listing the workflow blockers and the agent
 * Session blocker together.
 */
export async function previewCloseForCli(
  engine: SpecFlowEngine,
  request: PreviewRequest,
  preview: typeof previewPublicCloseOperation = previewPublicCloseOperation,
) {
  const occupancy = await checkoutOccupancy(engine, request);
  let plan: Awaited<ReturnType<typeof previewPublicCloseOperation>>;
  try {
    plan = await preview(engine, request);
  } catch (error) {
    if (occupancy && error instanceof CloseOperationError && error.code === 'CLOSE_BLOCKED') {
      throw new CloseOperationError('CLOSE_BLOCKED', error.message, {
        blockers: [...error.blockers, occupancy],
      });
    }

    throw error;
  }

  if (occupancy) {
    throw new CloseOperationError('CLOSE_BLOCKED', occupancy.message, { blockers: [occupancy] });
  }

  return plan;
}
