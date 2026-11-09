import type { ContextFact, SessionScope } from './sessionContextTypes';

/** The Context sections whose data is a `ContextFact` (telemetry and the planned areas are not). */
export type ContextSection =
  'executor' | 'specification' | 'executionScope' | 'attention' | 'relatedTasks' | 'workHistory';

/**
 * Whether a section exists for this kind of Session at all. A Session without a Specification
 * (standalone) or whose association is unknown has no Specification, execution, Attention or
 * Related Tasks sections: nothing is promised there, so nothing is shown (not even a "none").
 */
export function isSectionPresent(section: ContextSection, scope: SessionScope): boolean {
  switch (section) {
    case 'executor':
    case 'workHistory':
      return true;
    default:
      return scope.kind === 'specification' || scope.kind === 'task';
  }
}

/**
 * Whether a section MUST be resolvable for this Session: the executor always; the Specification
 * when the Session is Specification- or Task-scoped; the executed Task(s) when it is Task-scoped.
 * A required reference that cannot be found is an error, an optional one only a warning.
 */
export function isRequired(section: ContextSection, scope: SessionScope): boolean {
  switch (section) {
    case 'executor':
      return true;
    case 'specification':
      return scope.kind === 'specification' || scope.kind === 'task';
    case 'executionScope':
      return scope.kind === 'task';
    default:
      return false;
  }
}

export type ResolvedSection<T> =
  | { kind: 'omit' }
  | { kind: 'skeleton' }
  | { kind: 'ready'; value: T }
  | { kind: 'warning' }
  | { kind: 'error'; ref?: { key?: string } }
  /** The reference exists but may not be viewed: an info note, never an error. */
  | { kind: 'info' };

/**
 * What a section renders for a fact: an absent fact or an empty ready list is omitted (no
 * association, or nothing to show); loading shows the section label with skeleton rows;
 * unreadable is a warning; missing is a warning, or an error when the reference is required;
 * forbidden is an info note.
 */
export function resolveSection<T>(
  fact: ContextFact<T> | undefined,
  required: boolean,
): ResolvedSection<T> {
  if (!fact) {
    return { kind: 'omit' };
  }

  switch (fact.status) {
    case 'loading':
      return { kind: 'skeleton' };
    case 'ready':
      return Array.isArray(fact.value) && fact.value.length === 0
        ? { kind: 'omit' }
        : { kind: 'ready', value: fact.value };
    case 'unreadable':
      return { kind: 'warning' };
    case 'missing':
      return required ? { kind: 'error', ref: fact.ref } : { kind: 'warning' };
    case 'forbidden':
      return { kind: 'info' };
  }
}
