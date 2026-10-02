import { relative } from 'node:path';

import {
  initRuntime,
  serializeRuntimeConfig,
  type RuntimeInitPrompter,
} from '@nevo/specflow-runtime';
import { Command } from 'commander';

import {
  initializeProject,
  type InitializeProjectOptions,
  type InitializeProjectResult,
} from './initialize-project.js';

export interface ProjectInitCommandContext {
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly prompter?: RuntimeInitPrompter;
  readonly initialize?: (options: InitializeProjectOptions) => Promise<InitializeProjectResult>;
}

export function createProjectInitCommand(context: ProjectInitCommandContext): Command {
  return new Command('init')
    .description('Initialize Nevo SpecFlow configuration for this repository')
    .action(async () => {
      if (!context.prompter) {
        throw new Error('Interactive project initialization is not available in this CLI context.');
      }

      const result = await (context.initialize ?? initializeProject)({
        cwd: context.cwd,
        initRuntime: () => initRuntime({ prompter: context.prompter as RuntimeInitPrompter }),
        serializeConfig: serializeRuntimeConfig,
      });

      context.stdout('Initialized Nevo SpecFlow.');
      context.stdout(`Project config: ${relative(result.root, result.projectConfigPath)}`);
      context.stdout(`Local config: ${relative(result.root, result.localConfigPath)}`);
    });
}
