import type { Scope } from './types';

export function scopeMatches(assignmentScope: Scope, resourceScope: Scope): boolean {
  return Object.entries(assignmentScope).every(([key, value]) => resourceScope[key] === value);
}
