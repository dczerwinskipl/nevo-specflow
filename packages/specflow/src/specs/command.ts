import { randomUUID } from 'node:crypto';

import {
  createSpecificationFromRequest,
  resumeInterruptedCreateOperation,
  projectCreatedSpecification,
  closeSpecificationOperation,
  closeWorktreeOperation,
  closeWorkspaceOperation,
  planPublicWorkspaceCloseOperation,
  inspectPublicWorkspaceCloseOperation,
  previewPublicCloseOperation,
  reconcileArchivedConflictScratchOperation,
  discoverSpecifications,
  getBuiltInCatalogue,
  openSpecFlowEngine,
  resolveSpecification,
  type CreateSpecificationRequest,
  type DiscoveredSpecification,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import { inspectCloseOperationDiagnostic } from '@nevo/specflow-engine/diagnostics';
import { Command, InvalidArgumentError } from 'commander';

export interface SpecsCommandContext {
  readonly cwd: string;
  readonly stdout: (line: string) => void;
}

function summary(item: DiscoveredSpecification): Record<string, unknown> {
  if (item.status !== 'available') return item;
  return {
    status: item.status,
    specId: item.specId,
    workspaceId: item.workspaceId,
    workspaceRoot: item.workspaceRoot,
    binding: item.binding,
    specification: item.specification,
  };
}

function output(context: SpecsCommandContext, value: unknown): void {
  context.stdout(JSON.stringify(value));
}

/**
 * Offline capability adapter. This module has no dependency on Runtime or its
 * HTTP transport; all writes go through Engine's durable create use case.
 */
export function createSpecsCommand(context: SpecsCommandContext): Command {
  const specs = new Command('specs').description(
    'Create and inspect canonical local Specifications',
  );

  specs
    .command('create')
    .description('Create a Specification in the current checkout or a managed Git worktree')
    .requiredOption('--title <title>', 'Human-readable Specification title')
    // Required, no default in any layer: a CLI default would be a hidden second place that decides
    // the shape of the work (PC-3).
    .requiredOption('--archetype <id>', 'Archetype of the Specification (for example minimal)')
    .option(
      '--with <templateId>',
      'Suggested document of the archetype to create (repeatable)',
      collectUnique,
      [] as string[],
    )
    .option('--goal <description>', 'Optional Specification goal')
    .option('--workspace-id <id>', 'Target an existing registered workspace ID')
    .option('--worktree', 'Provision a managed Git worktree')
    .option('--base-ref <ref>', 'Optional Git base override (defaults to Project Home policy)')
    .option('--branch <branch>', 'Branch name for new worktree')
    .option(
      '--integration-target-workspace-id <id>',
      'Registered checkout to integrate the new worktree into',
    )
    .option('--operation-id <uuid>', 'Stable UUID for idempotent retries')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .option('--json', 'Print canonical result as JSON')
    .action(
      async (options: {
        title: string;
        archetype: string;
        with: string[];
        goal?: string;
        workspaceId?: string;
        worktree?: boolean;
        baseRef?: string;
        branch?: string;
        integrationTargetWorkspaceId?: string;
        operationId?: string;
        projectRoot?: string;
        json?: boolean;
      }) => {
        validateCreateOptions(options);
        const catalogue = getBuiltInCatalogue();
        const engine = await engineAt(context.cwd, options.projectRoot);
        const result = await createSpecificationFromRequest(engine, {
          operationId: options.operationId,
          title: options.title,
          goal: options.goal,
          target: resolveCliCreateTarget(engine, options),
          // The CLI runs against the catalogue of this very Engine, so it is current by construction.
          // An unknown id is refused by the Engine as ARCHETYPE_UNKNOWN whatever version is sent.
          archetype: {
            id: options.archetype,
            version: catalogue.findArchetype(options.archetype)?.version ?? 1,
          },
          catalogueRevision: catalogue.revision,
          optionalDocumentIds: options.with,
        });
        if (options.json) {
          output(context, projectCreatedSpecification(result));
        } else {
          context.stdout('Created Specification: ' + result.slug + ' (' + result.specId + ')');
          context.stdout('Workspace: ' + result.workspaceRoot + ' (' + result.workspaceId + ')');
          context.stdout('Manifest: ' + result.relativeManifestPath);
          context.stdout('Operation ID: ' + result.operationId);
          context.stdout('Documents: ' + result.documentIds.join(', '));
        }
      },
    );

  specs
    .command('recover')
    .description(
      'Resume an interrupted Create (stuck journal) with the intent it recorded; see specification-lifecycle docs',
    )
    .argument('<operation-id>', 'Create operation UUID (shown by the operations list)')
    .requiredOption(
      '--confirmed-stopped',
      'Confirm that no process of the original Create is still running',
    )
    .option(
      '--confirmed-git-stopped',
      'Also confirm that no Git process of the original Create is running (needed from stage git-initiated)',
    )
    .option('--project-root <path>', 'Require this verified Project Home root')
    .option('--json', 'Print canonical result as JSON')
    .action(
      async (
        operationId: string,
        options: {
          confirmedStopped: true;
          confirmedGitStopped?: boolean;
          projectRoot?: string;
          json?: boolean;
        },
      ) => {
        const engine = await engineAt(context.cwd, options.projectRoot);
        const result = await resumeInterruptedCreateOperation(engine, operationId, {
          confirmOriginalStopped: true,
          ...(options.confirmedGitStopped ? { confirmInterruptedGitSettled: true } : {}),
        });
        if (options.json) {
          output(context, projectCreatedSpecification(result));
        } else {
          context.stdout('Recovered Create: ' + result.slug + ' (' + result.specId + ')');
          context.stdout('Operation ID: ' + result.operationId);
        }
      },
    );

  const worktree = specs.command('worktree').description('Manage a dedicated linked Git workspace');
  worktree
    .command('close')
    .description(
      'Integrate the linked branch into its pinned destination, rebind the Spec and remove the managed worktree',
    )
    .argument('<spec-id>', 'Canonical Specification UUID')
    .option('--operation-id <uuid>', 'Stable operation UUID; reuse it for idempotent retry')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .option('--preview', 'Inspect the Close plan without writing')
    .option('--yes', 'Confirm whole-branch integration and worktree removal')
    .option('--json', 'Output machine-readable result')
    .action(async (specId: string, options: CliCloseOptions) => {
      const engine = await engineForClose(context.cwd, options.projectRoot);
      const operationId = options.operationId ?? randomUUID();
      if (options.preview) {
        output(
          context,
          await previewPublicCloseOperation(engine, {
            kind: 'worktree-close',
            operationId,
            specId,
          }),
        );
        return;
      }
      if (!options.yes)
        throw new Error('Closing a Git worktree requires --yes. Use --preview first.');
      const result = await closeWorktreeOperation(engine, { operationId, specId });
      if (options.json) {
        output(context, result);
      } else {
        context.stdout('Worktree Close: ' + result.status);
        context.stdout('Operation ID: ' + operationId);
        if (result.status === 'requires-resolution') {
          context.stdout('Merge conflict requires operator resolution; inspect: ' + operationId);
        }
      }
    });

  const workspace = specs
    .command('workspace')
    .description('Operate on an entire registered managed linked worktree');
  workspace
    .command('close')
    .description('Integrate a whole branch and atomically transfer all canonical Specs')
    .argument('<workspace-id>', 'Registered workspace UUID, not a Specification ID')
    .option('--operation-id <uuid>', 'Stable operation UUID for retries')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .option('--preview', 'Read-only preview, including every affected Spec')
    .option('--yes', 'Confirm WHOLE-branch integration and worktree removal')
    .option('--json', 'Output machine-readable result')
    .action(async (workspaceId: string, options: CliCloseOptions) => {
      const engine = await engineForClose(context.cwd, options.projectRoot);
      const operationId = options.operationId ?? randomUUID();
      const request = { workspaceId, operationId };
      if (options.preview) {
        output(context, await planPublicWorkspaceCloseOperation(engine, request));
        return;
      }
      if (!options.yes)
        throw new Error(
          'Whole-branch Workspace Close requires --yes. Use workspace close --preview first.',
        );
      const result = await closeWorkspaceOperation(engine, request);
      if (options.json) output(context, result);
      else {
        context.stdout('Workspace Close: ' + result.status);
        context.stdout('Affected Specifications: ' + result.occupantCount);
        context.stdout('Operation ID: ' + operationId);
      }
    });
  workspace
    .command('inspect')
    .description('Inspect workspace-level Close without mutating Git')
    .argument('<workspace-id>', 'Original source workspace UUID')
    .argument('<operation-id>', 'Durable operation UUID')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .action(async (workspaceId: string, operationId: string, options: { projectRoot?: string }) => {
      const engine = await engineForClose(context.cwd, options.projectRoot);
      const result = await inspectPublicWorkspaceCloseOperation(engine, operationId, workspaceId);
      if (!result) throw new Error('Workspace Close operation not found: ' + operationId);
      output(context, result);
    });

  specs
    .command('close')
    .description(
      'Commit an archival move; optionally integrate a linked source into its pinned destination',
    )
    .argument('<spec-id>', 'Canonical Specification UUID')
    .option('--operation-id <uuid>', 'Stable operation UUID; reuse it for idempotent retry')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .option('--archive-only', 'Archive linked Specification without merging or removing worktree')
    .option('--preview', 'Inspect the Close plan without writing')
    .option('--yes', 'Confirm archival mutation')
    .option('--json', 'Output machine-readable result')
    .action(async (specId: string, options: CliCloseOptions & { archiveOnly?: boolean }) => {
      const engine = await engineForClose(context.cwd, options.projectRoot);
      const operationId = options.operationId ?? randomUUID();
      const request = {
        kind: 'specification-close' as const,
        operationId,
        specId,
        ...(options.archiveOnly ? { integrateToTargetBranch: false } : {}),
      };
      if (options.preview) {
        output(context, await previewPublicCloseOperation(engine, request));
        return;
      }
      if (!options.yes)
        throw new Error('Archiving a Specification requires --yes. Use --preview first.');
      const result = await closeSpecificationOperation(engine, request);
      if (options.json) output(context, result);
      else {
        context.stdout('Specification Close: ' + result.status);
        context.stdout('Operation ID: ' + operationId);
        context.stdout('Outcome: ' + (result.outcome ?? result.status));
      }
    });

  specs
    .command('close-reconcile-scratch')
    .description('Reconcile a manually removed archived conflict scratch before new Worktree Close')
    .argument('<operation-id>', 'Stable Close operation UUID')
    .requiredOption(
      '--confirmed-git-stopped',
      'Confirm all processes using the scratch have stopped',
    )
    .requiredOption('--yes', 'Acknowledge operator-owned scratch cleanup')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .action(
      async (
        operationId: string,
        options: { projectRoot?: string; confirmedGitStopped: boolean },
      ) => {
        const engine = await engineForClose(context.cwd, options.projectRoot);
        const result = await reconcileArchivedConflictScratchOperation(
          engine,
          operationId,
          options.confirmedGitStopped,
        );
        output(context, {
          operationId,
          status: result.status,
          scratchRetired: result.scratchRetired === true,
          next: 'Start a NEW worktree-close for the still-archived linked Specification',
        });
      },
    );

  specs
    .command('close-inspect')
    .description('Inspect a durable Close operation without mutating Git')
    .argument('<operation-id>', 'Stable Close operation UUID')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .action(async (operationId: string, options: { projectRoot?: string }) => {
      const engine = await engineAt(context.cwd, options.projectRoot);
      const journal = await inspectCloseOperationDiagnostic(engine, operationId);
      if (!journal) throw new Error('Close operation not found: ' + operationId);
      output(context, journal);
    });

  specs
    .command('list')
    .description('List canonical Specs, including unavailable bindings')
    .option('--json', 'Output structured JSON')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .action(async (options: { json?: boolean; projectRoot?: string }) => {
      const engine = await engineAt(context.cwd, options.projectRoot);
      const found = await discoverSpecifications(engine);
      if (options.json) output(context, found.map(summary));
      else
        for (const item of found) {
          context.stdout(
            item.specId +
              ' ' +
              (item.status === 'available' ? item.specification.slug : item.status),
          );
        }
    });

  specs
    .command('resolve')
    .description('Resolve a canonical Spec ID and its verified source workspace')
    .argument('<spec-id>', 'Canonical specification UUID')
    .option('--json', 'Output structured JSON')
    .option('--project-root <path>', 'Require this verified Project Home root')
    .action(async (id: string, options: { json?: boolean; projectRoot?: string }) => {
      const item = await resolveSpecification(await engineAt(context.cwd, options.projectRoot), id);
      if (options.json) output(context, summary(item));
      else {
        context.stdout('Spec: ' + item.specId);
        context.stdout('Status: ' + item.status);
        context.stdout('Workspace: ' + item.workspaceId);
        if (item.status === 'available')
          context.stdout('Manifest: ' + item.specification.relativeManifestPath);
      }
    });
  return specs;
}

/** Closing the caller's own linked checkout must not invalidate Engine's control workspace. */
async function engineForClose(cwd: string, projectRoot?: string): Promise<SpecFlowEngine> {
  const selected = await engineAt(cwd, projectRoot);
  return openSpecFlowEngine({
    cwd: selected.context.project.homeRoot,
    projectRoot: selected.context.project.homeRoot,
  });
}

async function engineAt(cwd: string, projectRoot?: string): Promise<SpecFlowEngine> {
  return openSpecFlowEngine({
    cwd,
    ...(projectRoot ? { projectRoot } : {}),
  });
}

interface CliCloseOptions {
  readonly operationId?: string;
  readonly projectRoot?: string;
  readonly preview?: boolean;
  readonly yes?: boolean;
  readonly json?: boolean;
}

interface CliCreateOptions {
  readonly worktree?: boolean;
  readonly workspaceId?: string;
  readonly baseRef?: string;
  readonly branch?: string;
  readonly integrationTargetWorkspaceId?: string;
}

/** Repeatable option value: each template id once; a repeat is a usage error. */
function collectUnique(value: string, previous: string[]): string[] {
  if (previous.includes(value)) {
    throw new InvalidArgumentError(`--with ${value} was given more than once.`);
  }
  return [...previous, value];
}

function validateCreateOptions(options: CliCreateOptions): void {
  if (options.worktree && options.workspaceId) {
    throw new Error('Choose either --worktree or --workspace-id.');
  }
  if (
    !options.worktree &&
    (options.baseRef || options.branch || options.integrationTargetWorkspaceId)
  ) {
    throw new Error(
      '--base-ref, --branch and --integration-target-workspace-id require --worktree.',
    );
  }
}

function resolveCliCreateTarget(
  engine: SpecFlowEngine,
  options: CliCreateOptions,
): CreateSpecificationRequest['target'] {
  if (options.worktree) {
    return {
      kind: 'new-worktree',
      ...(options.baseRef !== undefined ? { baseRef: options.baseRef } : {}),
      ...(options.branch !== undefined ? { branch: options.branch } : {}),
      ...(options.integrationTargetWorkspaceId !== undefined
        ? { integrationTargetWorkspaceId: options.integrationTargetWorkspaceId }
        : {}),
    };
  }
  return { kind: 'existing', workspaceId: options.workspaceId ?? engine.workspace.workspaceId };
}
