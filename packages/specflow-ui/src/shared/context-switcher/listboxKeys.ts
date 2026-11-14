/**
 * The option a key moves to in a vertical listbox of `count` options from `index`: ArrowDown and
 * ArrowUp wrap around, Home and End go to the ends; any other key (ArrowLeft and ArrowRight
 * included) is not the listbox's: `null`.
 */
export function listboxIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) {
    return null;
  }

  switch (key) {
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
