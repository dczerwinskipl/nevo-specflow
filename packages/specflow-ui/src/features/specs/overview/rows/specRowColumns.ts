/**
 * The three columns of a specification row (title, situation/milestone, progress/pull request),
 * shared by the column header and the rows so they cannot drift apart. Columns appear from the
 * 48rem container width; below it each row stacks.
 *
 * The title track is bounded (`minmax(0,40rem)`, a reading measure) so the situation and progress
 * always stay next to the name they qualify, whatever width the list is given; the rest of a wide
 * row stays empty instead of pushing them apart.
 */
/**
 * The title track's maximum as a width limit, for the list's text blocks above the rows (the search
 * field, a failed-read notice): they stay as wide as the titles they lead to, not the whole frame.
 */
export const specTitleTrackMaxWidth = 'max-w-[40rem]';

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
