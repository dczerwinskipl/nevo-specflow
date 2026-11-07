/**
 * The three columns of a specification row (title, situation/milestone, progress/pull request),
 * shared by the column header and the rows so they cannot drift apart. Columns appear from the
 * 48rem container width; below it each row stacks.
 *
 * The title track is bounded (`minmax(0,40rem)`, a reading measure, about its width in a
 * `content-standard` list) so the situation and progress stay next to the name they qualify when
 * the Focused frame grows; the rest of a wide row stays empty instead of pushing them apart.
 */
export const specRowColumns = {
  current: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,40rem)_15rem_8.25rem]',
    row: '@min-[48rem]/collection:grid-cols-[minmax(0,40rem)_15rem_8.25rem]',
  },
  /**
   * Flat list, work status unavailable: the title, when it was last updated (in the place of the
   * situation, so the date scans down the list) and, only when it exists, the progress.
   */
  flat: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,40rem)_8rem]',
    row: '@min-[48rem]/collection:grid-cols-[minmax(0,40rem)_8rem]',
  },
  flatWithProgress: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,40rem)_8rem_8.25rem]',
    row: '@min-[48rem]/collection:grid-cols-[minmax(0,40rem)_8rem_8.25rem]',
  },
  archive: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,40rem)_12rem_6rem]',
    row: '@min-[48rem]/collection:grid-cols-[minmax(0,40rem)_12rem_6rem]',
  },
} as const;
