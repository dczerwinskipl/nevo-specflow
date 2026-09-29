import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function findRepoRoot(start: string): string {
  let current = resolve(start);
  for (;;) {
    if (
      existsSync(join(current, 'pnpm-workspace.yaml')) &&
      existsSync(join(current, 'package.json'))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) throw new Error(`cannot find repository root from ${start}`);
    current = parent;
  }
}
