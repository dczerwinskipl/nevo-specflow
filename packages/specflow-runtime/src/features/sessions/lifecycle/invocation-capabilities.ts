import type { DriverFact } from '../persistence/protocol';

/**
 * The trusted binding of a write Turn's invocation capability (D11): what the Runtime knows of the
 * Turn, never anything the agent says. `workspace` is the root the Engine claimed for it.
 */
export interface InvocationCapabilityBinding {
  readonly invocationId: string;
  readonly sessionId: string;
  readonly turnId: string;
  /** The Specification the Session is associated with (its home Specification). */
  readonly specId: string;
  readonly workspace: string;
  /** The Turn's provider and model: the agent its writes are made as. */
  readonly provider: string;
  readonly model?: string;
  /** The agent attempt the Turn belongs to (Ask agent): its scope is the attempt's. */
  readonly attemptId?: string;
}

/**
 * One minted capability of one invocation, held only in this Runtime process. It admits nothing
 * until `activate` (the claim is `dispatched`) and nothing after `revoke` (the Turn is ending).
 */
export interface InvocationGrant {
  /** The provider environment entries (`NEVO_*`): the broker endpoint and the capability. */
  readonly environment: Readonly<Record<string, string>>;
  /** Values a process owner must redact from what it captures (diagnostics). */
  readonly secrets: readonly string[];
  activate(): void;
  /**
   * Admits nothing more at once and resolves once the broker calls already running have finished
   * (`drained`), or when its bounded wait ends with one still running (`timed-out`: a write may
   * still land, so the claim must not settle normally). Afterwards `activate` changes nothing.
   */
  revoke(): Promise<'drained' | 'timed-out'>;
  /** The text with every capability value replaced; for transcripts and stored tool output. */
  redact(text: string): string;
}

/**
 * The port Sessions uses to give a write Turn its invocation capability; the agent-execution
 * feature implements it. `mint` refuses (throws) when no write Turn may receive one now.
 */
export interface InvocationCapabilities {
  mint(binding: InvocationCapabilityBinding): Promise<InvocationGrant>;
}

/** The fact with `redact` applied to every string it carries (text, tool input and output, errors). */
export function redactFact<T extends DriverFact>(fact: T, redact: (text: string) => string): T {
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return redact(value);
    }

    if (Array.isArray(value)) {
      return value.map(visit);
    }

    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry)]));
    }

    return value;
  };

  return visit(fact) as T;
}
