import { randomUUID } from 'node:crypto';

import type { SpecFlowEngine } from '../../application';
import { readExecutionJournal } from '../../execution/journal';
import { settleWorkspaceExecutionInSection } from '../../execution/operations';
import type {
  WorkspaceExecutionIntent,
  WorkspaceExecutionJournal,
  WorkspaceExecutionReceipt,
} from '../../execution/model';
import type { WorkspaceExecutionTarget } from '../../execution/operations';
import { readWorkspaceRegistry } from '../../project/workspace/registry/registry';
import type { OwnedExecutionClaim } from '../../specs/durable';
import { listUncleanPaths } from '../../specs/lifecycle/preflight';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { engineExecutionStore, openWorkflow, type OpenWorkflowOptions } from '../composition';
import type { WorkflowDependencies } from '../operations/loaded-execution';
import type { WorkflowStore } from '../state/store';
import { executionClaimAdmission, type WorkflowWriteAdmission } from '../write-admission';
import type { AttributionFacts } from './boundary/attribution';
import { dirtySetOf, type DirtySetFacts } from './boundary/dirty-set';
import { engineAttributionFacts } from './boundary/engine-facts';
import {
  workflowPostActionRunner,
  type AgentPostActionRunner,
  type FinalizeBoundary,
} from './finalize/ports';
import { openDocumentWritesOf } from './finalize/open-writes';
import { filesystemAgentAttemptJournal, type AgentAttemptJournalStore } from './journal/store';

/** What the agent attempt operations need besides the workflow operations themselves. */
export interface AgentAttemptDependencies {
  readonly workflow: WorkflowDependencies;
  readonly journal: AgentAttemptJournalStore;
  /**
   * The writer-claim admission of a journal write, inside the `serialize` section: `owned` names the
   * execution claim of the Turn that writes (the `turn` form; the `finalize` form only in the
   * finalize section), none for an owner's request.
   */
  readonly admission: (owned: OwnedExecutionClaim | undefined) => WorkflowWriteAdmission;
  /** A new attempt id (a UUID). */
  readonly newId: () => string;
  readonly finalize: AgentFinalizeDependencies;
  /** What the attribution checks of an agent attempt read (B3, B6). */
  readonly boundary: AgentBoundaryDependencies;
}

/** The facts the attribution boundary judges, read from the attempt's checkout. */
export interface AgentBoundaryDependencies {
  /**
   * What is uncommitted in the checkout now and which of it the Engine wrote; `undefined` with Git
   * off. Lock-free.
   */
  facts(workspaceId: string): Promise<AttributionFacts | undefined>;
}

/** The lock-held forms the finalize section calls, and what runs after it. */
export interface AgentFinalizeDependencies {
  /**
   * The execution store whose changes are admitted with `owned` (the `finalize` form of the ended
   * Turn's claim) as the caller's own claim; used only inside the finalize section.
   */
  store(owned: OwnedExecutionClaim): WorkflowStore;
  /** The claim settlement with the native-result receipt, inside the section (never locks). */
  settleClaim(
    intent: WorkspaceExecutionIntent,
    receipt: WorkspaceExecutionReceipt,
    target: WorkspaceExecutionTarget,
  ): Promise<void>;
  /** The execution claim of `invocationId`, `undefined` when none (lock-free read). */
  claim(
    invocationId: string,
  ): Promise<Pick<WorkspaceExecutionJournal, 'phase' | 'settlement'> | undefined>;
  /**
   * The document changes of the Turn `invocationId` that are still writing (operation ids); the
   * finalize refuses while there is one.
   */
  openWrites(invocationId: string): Promise<readonly string[]>;
  /** What the attempt's checkout has uncommitted now; `undefined` when Git is off. */
  dirtySet(workspaceId: string): Promise<DirtySetFacts | undefined>;
  /** Runs a pending post action after the section (the attempt commit joins here, D15). */
  readonly postActions: AgentPostActionRunner;
  /** Test seam: called at each crash boundary of the finalize; a throw simulates the crash. */
  readonly faults?: (boundary: FinalizeBoundary) => void | Promise<void>;
}

/** The dirty set of a registered checkout, from its Git status; none with Git off. */
async function engineDirtySet(
  engine: SpecFlowEngine,
  workspaceId: string,
): Promise<DirtySetFacts | undefined> {
  if (!(await readProjectGitPolicy(engine.context)).policy.enabled) {
    return undefined;
  }

  const workspace = (await readWorkspaceRegistry(engine.context)).workspaces.find(
    (entry) => entry.workspaceId === workspaceId,
  );
  if (!workspace) {
    return undefined;
  }

  const unclean = await listUncleanPaths(workspace.root);

  return dirtySetOf(
    workspace.root,
    unclean.map((entry) => entry.path),
  );
}

/**
 * The agent attempt operations of an opened Engine. `options` open its workflow operations (the
 * project documents of `project-document` context references; never an owned execution: every
 * agent attempt operation names the claim it runs under itself).
 */
export async function openAgentAttempts(
  engine: SpecFlowEngine,
  options: Pick<OpenWorkflowOptions, 'projectDocument'> = {},
): Promise<AgentAttemptDependencies> {
  const workflow = await openWorkflow(engine, options);

  return {
    workflow,
    journal: filesystemAgentAttemptJournal(engine.context),
    admission: (owned) => executionClaimAdmission(engine, owned),
    newId: randomUUID,
    boundary: { facts: (workspaceId) => engineAttributionFacts(engine, workspaceId) },
    finalize: {
      store: (owned) => engineExecutionStore(engine, owned),
      async settleClaim(intent, receipt, target) {
        await settleWorkspaceExecutionInSection(engine, intent, receipt, target);
      },
      claim: (invocationId) => readExecutionJournal(engine.context, invocationId),
      openWrites: (invocationId) => openDocumentWritesOf(engine.context, invocationId),
      dirtySet: (workspaceId) => engineDirtySet(engine, workspaceId),
      postActions: workflowPostActionRunner(workflow),
    },
  };
}
