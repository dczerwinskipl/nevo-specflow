import type { FlushAllOutcome, SpecFlowEngine } from '@nevo/specflow-engine';

/** The shutdown flush deadline of the document queue. */
export const EXIT_FLUSH_DEADLINE_MS = 10_000;

/**
 * Before a CLI command that queued commits exits, commits what the document queue holds, as the
 * Runtime's scheduler would (a one-shot process runs no scheduler). Never fails the command: what is
 * still queued at the deadline stays journaled, and stderr says how to commit it.
 */
export async function drainDocumentQueueAtExit(
  engine: SpecFlowEngine,
  flushAll: (engine: SpecFlowEngine, deadlineMs: number) => Promise<FlushAllOutcome>,
  stderr: (line: string) => void,
  deadlineMs: number = EXIT_FLUSH_DEADLINE_MS,
): Promise<void> {
  try {
    const outcome = await flushAll(engine, deadlineMs);
    if (outcome.remaining > 0) {
      stderr(
        `${outcome.remaining} document commit(s) are still queued; they stay journaled. ` +
          'Run "nevo-specflow specs documents flush" to commit them.',
      );
    }
  } catch (error) {
    stderr(
      `Could not drain the commit queue: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
