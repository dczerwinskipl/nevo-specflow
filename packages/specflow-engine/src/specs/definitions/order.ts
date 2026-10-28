/** Code-unit order of two strings: the one deterministic order the definitions layer sorts by. */
export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
