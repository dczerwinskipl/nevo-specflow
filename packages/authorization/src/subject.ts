import type { Subject } from './types.js';

export function subjectsEqual(left: Subject, right: Subject): boolean {
  return left.kind === right.kind && left.id === right.id;
}
