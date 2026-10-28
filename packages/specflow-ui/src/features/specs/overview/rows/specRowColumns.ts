/**
 * The three columns of a specification row (title, situation/milestone, progress/pull request),
 * shared by the column header and the rows so they cannot drift apart. Columns appear from the
 * 48rem container width; below it each row stacks.
 */
export const specRowColumns = {
  current: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,1fr)_15rem_7rem]',
    row: '@min-[48rem]/collection:grid-cols-[minmax(0,1fr)_15rem_7rem]',
  },
  /**
   * Flat list, work status unavailable: the title, when it was last updated (in the place of the
   * situation, so the date scans down the list) and, only when it exists, the progress.
   */
  flat: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,1fr)_8rem]',
    row: '@min-[48rem]/collection:grid-cols-[minmax(0,1fr)_8rem]',
  },
  flatWithProgress: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,1fr)_8rem_7rem]',
    row: '@min-[48rem]/collection:grid-cols-[minmax(0,1fr)_8rem_7rem]',
  },
  archive: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,1fr)_12rem_6rem]',
    row: '@min-[48rem]/collection:grid-cols-[minmax(0,1fr)_12rem_6rem]',
  },
} as const;
