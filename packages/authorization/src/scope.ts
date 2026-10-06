import type { Scope } from './types';

/**
 * Returns true when a possessed scope covers the required scope.
 *
 * An empty possessed scope is global. A more specific possessed scope never
 * grants access to a broader required scope.
 */
export function scopeCovers(possessedScope: Scope, requiredScope: Scope): boolean {
  return Object.entries(possessedScope).every(
    ([key, value]) => Object.hasOwn(requiredScope, key) && requiredScope[key] === value,
  );
}
