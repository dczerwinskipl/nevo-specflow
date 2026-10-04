import * as prompts from '@clack/prompts';

import type {
  RuntimeSetupChoice,
  RuntimeSetupSelectValue,
  RuntimeSetupUi,
} from '@nevo/specflow-runtime';

export class ProjectSetupCancelledError extends Error {
  constructor() {
    super('SpecFlow setup cancelled.');
    this.name = 'ProjectSetupCancelledError';
  }
}

export class ClackProjectSetupUi implements RuntimeSetupUi {
  async confirm(message: string, initialValue = true): Promise<boolean> {
    const value = await prompts.confirm({ message, initialValue });
    return resolvePrompt<boolean>(value);
  }

  async select<T extends RuntimeSetupSelectValue>(
    message: string,
    choices: readonly RuntimeSetupChoice<T>[],
    initialValue?: T,
  ): Promise<T> {
    const options = choices.map(
      (choice) =>
        ({
          value: choice.value,
          label: choice.label,
          ...(choice.hint ? { hint: choice.hint } : {}),
        }) as prompts.Option<T>,
    );

    const value = await prompts.select<T>({
      message,
      options,
      ...(initialValue !== undefined ? { initialValue } : {}),
    });
    return resolvePrompt<T>(value);
  }

  async input(message: string, defaultValue?: string): Promise<string> {
    const value = await prompts.text({
      message,
      ...(defaultValue !== undefined ? { placeholder: defaultValue, defaultValue } : {}),
    });
    return resolvePrompt<string>(value);
  }

  async secret(message: string): Promise<string> {
    const value = await prompts.password({ message });
    return resolvePrompt<string>(value);
  }

  note(message: string, title?: string): void {
    prompts.note(message, title);
  }
}

function resolvePrompt<T>(value: T | typeof prompts.CANCEL_SYMBOL): T {
  if (prompts.isCancel(value)) {
    prompts.cancel('SpecFlow setup cancelled.');
    throw new ProjectSetupCancelledError();
  }
  return value;
}
