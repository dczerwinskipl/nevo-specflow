import {
  CloseOperationError,
  closePreviewCheckoutBlocker,
  previewPublicCloseOperation,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';

type PreviewRequest = Parameters<typeof previewPublicCloseOperation>[1];

/**
 * `specs close --preview` and `specs worktree close --preview`: the read-only plan, refused with
 * `CLOSE_BLOCKED` exactly where Close would refuse, listing the workflow blockers and the agent
 * Session blocker (`session-turn-running`, by Close's own checkout rule) together.
 */
export async function previewCloseForCli(
  engine: SpecFlowEngine,
  request: PreviewRequest,
  ports: {
    readonly preview?: typeof previewPublicCloseOperation;
    readonly occupancy?: typeof closePreviewCheckoutBlocker;
  } = {},
) {
  const occupancy = await (ports.occupancy ?? closePreviewCheckoutBlocker)(engine, request);
  let plan: Awaited<ReturnType<typeof previewPublicCloseOperation>>;
  try {
    plan = await (ports.preview ?? previewPublicCloseOperation)(engine, request);
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
