import { createHash } from 'node:crypto';

import { WorkflowError } from './errors';

/**
 * Canonical JSON of a value: object keys sorted, `undefined` entries dropped. The revision of a
 * compiled definition is the sha256 of it, so the same definition always has the same revision,
 * whatever order its fields were built in.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }

  return value;
}

/** The definition a run is interpreted with: a changed definition never reinterprets a run. */
export interface WorkflowPin {
  readonly id: string;
  readonly version: number;
  /** sha256 (lowercase hex) of the canonical JSON of the compiled definition. */
  readonly revision: string;
}

interface Pinnable {
  readonly id: string;
  readonly version: number;
}

export function definitionRevision(definition: Pinnable): string {
  return createHash('sha256').update(canonicalJson(definition), 'utf8').digest('hex');
}

export function pinOf(definition: Pinnable): WorkflowPin {
  return {
    id: definition.id,
    version: definition.version,
    revision: definitionRevision(definition),
  };
}

export function isPinnedTo(pin: WorkflowPin, definition: Pinnable): boolean {
  return pin.id === definition.id && pin.revision === definitionRevision(definition);
}

/** A run is only ever interpreted with the exact definition it was pinned to. */
export function assertPinned(pin: WorkflowPin, definition: Pinnable): void {
  if (!isPinnedTo(pin, definition)) {
    throw new WorkflowError(
      'WORKFLOW_DEFINITION_CHANGED',
      `The run is pinned to workflow "${pin.id}" version ${pin.version}, which is not the given definition.`,
    );
  }
}
