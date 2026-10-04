import * as prompts from '@clack/prompts';

import type {
  RuntimeSetupChoice,
  RuntimeSetupUi,
} from '@nevo/specflow-runtime';

export class ProjectSetupCancelledError extends Error {
  constructor() {
    super('SpecFlow setup cancelled.');
    this.name = 'ProjectSetupCancelledError';
  }
}

export class ClackProjectSetupUi implements RuntimeSetupUi {
  confirm(message: string, initialValue = true): Promise<boolean> {
    return resolvePrompt(
      prompts.confirm({ message, initialValue }),
      'SpecFlow setup cancelled.',
    );
  }

  select<T extends string>(
    message: string,
    choices: readonly RuntimeSetupChoice<T>[],
    initialValue?: T,
  ): Promise<T> {
    return resolvePrompt(
      prompts.select<T>({
        message,
        options: choices.map((choice) => ({
          value: choice.value,
          label: choice.label,
          ...(choice.hint ? { hint: choice.hint } : {}),
        })),
        ...(initialValue ? { initialValue } : {}),
      }),
      'SpecFlow setup cancelled.',
    );
  }

  input(message: string, defaultValue?: string): Promise<string> {
    return resolvePrompt(
      prompts.text({
        message,
        ...(defaultValue !== undefined
          ? { placeholder: defaultValue, defaultValue }
          : {}),
      }),
      'SpecFlow setup cancelled.',
    );
  }

  secret(message: string): Promise<string> {
    return resolvePrompt(prompts.password({ message }), 'SpecFlow setup cancelled.');
  }

  note(message: string, title?: string): void {
    prompts.note(message, title);
  }
}

async function resolvePrompt<T>(
  pending: Promise<T | symbol>,
  cancellationMessage: string,
): Promise<T> {
  const value = await pending;
  if (prompts.isCancel(value)) {
    prompts.cancel(cancellationMessage);
    throw new ProjectSetupCancelledError();
  }
  return value as T;
}
