import { relative } from 'node:path';

import { Command } from 'commander';

import {
  initializeProject,
  type InitializeProjectOptions,
  type InitializeProjectResult,
} from './initialize-project.js';
import { collectProjectInitInput, type ProjectInitPrompter } from './prompts.js';

export interface ProjectInitCommandContext {
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly prompter?: ProjectInitPrompter;
  readonly initialize?: (options: InitializeProjectOptions) => Promise<InitializeProjectResult>;
}

export function createProjectInitCommand(context: ProjectInitCommandContext): Command {
  return new Command('init')
    .description('Initialize Nevo SpecFlow configuration for this repository')
    .action(async () => {
      if (!context.prompter) {
        throw new Error('Interactive project initialization is not available in this CLI context.');
      }

      const input = await collectProjectInitInput(context.prompter);
      const result = await (context.initialize ?? initializeProject)({
        cwd: context.cwd,
        input,
      });

      context.stdout('Initialized Nevo SpecFlow.');
      context.stdout(`Project config: ${relative(result.root, result.projectConfigPath)}`);
      context.stdout(`Local config: ${relative(result.root, result.localConfigPath)}`);
      context.stdout(`Authentication: ${result.authMode}`);
    });
}
