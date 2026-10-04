export interface RuntimeSetupChoice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

export interface RuntimeSetupUi {
  confirm(message: string, initialValue?: boolean): Promise<boolean>;
  select<T extends string>(
    message: string,
    choices: readonly RuntimeSetupChoice<T>[],
    initialValue?: T,
  ): Promise<T>;
  input(message: string, defaultValue?: string): Promise<string>;
  secret(message: string): Promise<string>;
  note(message: string, title?: string): void;
}

export interface RuntimeInitContribution {
  readonly projectConfig: Record<string, unknown>;
  readonly localConfig: Record<string, unknown>;
  readonly summary: readonly string[];
}
