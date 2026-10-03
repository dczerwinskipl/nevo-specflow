export interface RuntimeInitPromptChoice<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface RuntimeInitPrompter {
  select<T extends string>(
    message: string,
    choices: readonly RuntimeInitPromptChoice<T>[],
  ): Promise<T>;
  input(message: string, defaultValue?: string): Promise<string>;
  secret(message: string): Promise<string>;
}

export interface RuntimeInitContribution {
  readonly projectConfig: Record<string, unknown>;
  readonly localConfig: Record<string, unknown>;
}
