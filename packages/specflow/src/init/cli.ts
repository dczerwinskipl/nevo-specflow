import { relative } from 'node:path';

import { initRuntime, type RuntimeInitPrompter } from '@nevo/specflow-runtime';
import { Command } from 'commander';

import { resolveProjectLayout, type ProjectLayout } from '../project/layout.js';

import {
  initializeProject,
  type InitializeProjectOptions,
  type InitializeProjectResult,
} from './initialize-project.js';

export interface ProjectInitCommandContext {
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly prompter?: RuntimeInitPrompter;
  readonly resolveLayout?: (cwd: string) => Promise<ProjectLayout>;
  readonly initialize?: (options: InitializeProjectOptions) => Promise<InitializeProjectResult>;
}

export function createProjectInitCommand(context: ProjectInitCommandContext): Command {
  return new Command('init')
    .description('Initialize Nevo SpecFlow configuration for this repository')
    .action(async () => {
      const prompter = context.prompter;
      if (!prompter) {
        throw new Error('Interactive project initialization is not available in this CLI context.');
      }

      const layout = await (context.resolveLayout ?? resolveProjectLayout)(context.cwd);
      const result = await (context.initialize ?? initializeProject)({
        layout,
        initRuntime: () => initRuntime({ prompter }),
      });

      context.stdout('Initialized Nevo SpecFlow.');
      context.stdout(`Project config: ${relative(result.root, result.projectConfigPath)}`);
      context.stdout(`Local config: ${relative(result.root, result.localConfigPath)}`);
    });
}
