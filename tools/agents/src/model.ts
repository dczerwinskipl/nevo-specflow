export type Provider = 'claude' | 'codex' | 'antigravity';
export type ContentMode = 'embed' | 'reference';
export type Delivery = 'inline' | 'reference' | 'auto';

export interface ConditionalApplies {
  readonly when: string;
}

export type Applies = 'always' | ConditionalApplies;

export interface AgentInstruction {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly source: string;
  readonly required: boolean;
  readonly applies: Applies;
  readonly delivery: Delivery;
}

export interface AgentDefinition {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly file: string;
  readonly instructions: readonly AgentInstruction[];
}

export interface LoadedInstruction extends AgentInstruction {
  readonly absoluteSource: string;
  readonly content: string;
}

export interface LoadedAgent extends Omit<AgentDefinition, 'instructions'> {
  readonly instructions: readonly LoadedInstruction[];
}

export interface RenderedFile {
  readonly path: string;
  readonly content: string;
}
