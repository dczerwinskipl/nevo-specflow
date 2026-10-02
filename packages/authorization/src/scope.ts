import type { Scope } from './types.js';

export function scopeMatches(assignmentScope: Scope, resourceScope: Scope): boolean {
  return Object.entries(assignmentScope).every(
    ([key, value]) => resourceScope[key] === value,
  );
}
