import type { Subject } from './types';

export function subjectsEqual(left: Subject, right: Subject): boolean {
  return left.kind === right.kind && left.id === right.id;
}
