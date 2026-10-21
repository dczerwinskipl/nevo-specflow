/** Explicit fixture input shared by owner-specific demo adapters; never used by project readers. */
export interface DemoSpecification {
  id: string;
  /** Optional human-facing key (for example `UI-1234`), shown next to the title in navigation. */
  key?: string;
  title: string;
  progress: { completed: number; total: number };
  readyForWork?: boolean;
  currentExecutions?: readonly {
    sessionId: string;
    agentRole: string;
    taskIds: readonly string[];
  }[];
  signals?: readonly {
    id: string;
    kind: string;
    label: string;
    reason?: string;
    attentionReason?: string;
    target:
      | { kind: 'specification'; specId: string }
      | { kind: 'task'; specId: string; taskId: string }
      | { kind: 'session'; specId: string; sessionId: string };
  }[];
}
export interface DemoCatalogue {
  find(specId: string): Promise<DemoSpecification | undefined>;
  all(): Promise<readonly DemoSpecification[]>;
}
