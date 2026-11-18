import { Typography, cn } from '@nevo/ui';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/*
 * The collection pattern of the operational lists (Specifications list, Tasks page, Overview Task
 * rows): a bounded title track, then fixed fact tracks, shared by an optional column header and the
 * rows so they cannot drift apart. The columns appear from a 48rem width of the collection
 * container (`collectionContainer`); below it every row stacks in DOM order and the header is
 * hidden. Every class that depends on that switch lives in this file, so the 48rem is decided once.
 *
 * Tailwind needs every class as a static string, so the presets and the wide-only classes below are
 * spelled out, not composed.
 */

/** The query container the columns switch on. Put it on the element that holds header and rows. */
export const collectionContainer = '@container/collection';

/**
 * The title track's maximum as a width limit, for text blocks above the rows (a search or filter
 * field, a failed-read notice): they stay as wide as the titles they lead to, not the whole frame.
 * Keep the 40rem in step with the `minmax(0,40rem)` title track of every preset below.
 */
export const collectionTitleTrackMaxWidth = 'max-w-[40rem]';

/**
 * A row's title link, stretched over the whole row so the row is one target (the row surface is
 * `InformationList.Item`): it wraps (never truncates), breaks a long word only when it must, and
 * draws the focus ring on the row.
 */
export const collectionPrimaryLink =
  'pointer-events-auto static cursor-pointer whitespace-normal [overflow-wrap:anywhere] outline-none after:absolute after:inset-0 after:rounded-control focus-visible:after:outline-2 focus-visible:after:outline-focus-ring hover:text-content-link';

/**
 * Named track presets. The title track is bounded (`minmax(0,40rem)`, a reading measure), so the
 * facts always stay next to the name they qualify, whatever width the list is given; the rest of a
 * wide row stays empty while the row surface, hover and focus span the whole list.
 */
const collectionTrackPresets = {
  /** Specifications, current: title, situation, progress. */
  specification: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,40rem)_15rem_8.25rem]',
    row: 'gap-y-2 @min-[48rem]/collection:grid-cols-[minmax(0,40rem)_15rem_8.25rem]',
  },
  /** Specifications without work status: title, last updated. */
  specificationFlat: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,40rem)_8rem]',
    row: 'gap-y-2 @min-[48rem]/collection:grid-cols-[minmax(0,40rem)_8rem]',
  },
  /** Specifications without work status but with progress: title, last updated, progress. */
  specificationFlatWithProgress: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,40rem)_8rem_8.25rem]',
    row: 'gap-y-2 @min-[48rem]/collection:grid-cols-[minmax(0,40rem)_8rem_8.25rem]',
  },
  /** Specifications, archive: title, milestone, pull request. */
  specificationArchive: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,40rem)_12rem_6rem]',
    row: 'gap-y-2 @min-[48rem]/collection:grid-cols-[minmax(0,40rem)_12rem_6rem]',
  },
  /**
   * Tasks: title, then the status column (status line and one supporting line, for example a hold
   * reason). The status track grows to 22rem so a reason keeps a readable measure.
   */
  task: {
    header: '@min-[48rem]/collection:grid grid-cols-[minmax(0,40rem)_minmax(15rem,22rem)]',
    row: 'gap-y-1.5 @min-[48rem]/collection:grid-cols-[minmax(0,40rem)_minmax(15rem,22rem)]',
  },
} as const;

export type CollectionTracks = keyof typeof collectionTrackPresets;

/**
 * Classes that apply only once the columns show (from 48rem of collection width), for cells whose
 * stacked order or content differs from the column order. Use these rather than writing the
 * container query in a feature.
 */
export const collectionWide = {
  /** Place the cell in the second column of the first row. */
  column2: '@min-[48rem]/collection:col-start-2 @min-[48rem]/collection:row-start-1',
  /** Place the cell in the third column of the first row. */
  column3: '@min-[48rem]/collection:col-start-3 @min-[48rem]/collection:row-start-1',
  /** Hidden in columns (the column header names it). */
  hidden: '@min-[48rem]/collection:hidden',
  /** Read by assistive technology only in columns (the header is `aria-hidden`). */
  srOnly: '@min-[48rem]/collection:sr-only',
  /**
   * Shown only in columns, inline. It contains `hidden`: do not merge it with another display
   * class (`flex`, `grid`, …) through `cn`, tailwind-merge keeps only the last display class.
   */
  inline: 'hidden @min-[48rem]/collection:inline',
  /** Shown only in columns, as a block. Contains `hidden`: the same caveat as `inline`. */
  block: 'hidden @min-[48rem]/collection:block',
  /** A flex cell that becomes a column: stacked inside its track. */
  flexColumn: '@min-[48rem]/collection:flex-col',
  /** With `flexColumn`: start-aligned items. */
  itemsStart: '@min-[48rem]/collection:items-start',
  /** Moves an item after its siblings in columns. */
  order2: '@min-[48rem]/collection:order-2',
} as const;

export interface CollectionColumnsProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  readonly tracks: CollectionTracks;
  /** One label per track, in track order. */
  readonly labels: readonly ReactNode[];
}

/**
 * The column header: one label per track, on the rows' content axis. Visual only (`aria-hidden`);
 * a cell whose meaning the header carries keeps its own accessible text (`collectionWide.srOnly`).
 * Omit it where the surrounding section already names the columns (for example Overview rows).
 */
export function CollectionColumns({ tracks, labels, className, ...rest }: CollectionColumnsProps) {
  return (
    <Typography
      {...rest}
      as="div"
      variant="body-sm"
      aria-hidden="true"
      data-collection-columns={tracks}
      className={cn(
        'hidden min-w-0 gap-x-6 px-2 text-content-secondary',
        collectionTrackPresets[tracks].header,
        className,
      )}
    >
      {labels.map((label, index) => (
        <span key={index}>{label}</span>
      ))}
    </Typography>
  );
}

export interface CollectionRowProps extends ComponentPropsWithoutRef<'div'> {
  readonly tracks: CollectionTracks;
}

/**
 * The cell grid of one row, inside the row surface (`InformationList.Content`): the tracks from
 * 48rem, a vertical stack in DOM order below it. `className` is merged with tailwind-merge: a
 * display or `grid-cols-*` class there replaces the row's own grid and breaks the tracks.
 */
export function CollectionRow({ tracks, className, children, ...rest }: CollectionRowProps) {
  return (
    <div
      {...rest}
      className={cn('grid min-w-0 gap-x-6', collectionTrackPresets[tracks].row, className)}
    >
      {children}
    </div>
  );
}

export interface CollectionSupportingLineProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** The full text, where a tighter clamp (`className`) may cut it. */
  readonly title?: string;
}

/**
 * The one supporting line under a fact cell's main line (for example a Task's hold reason under its
 * status): secondary, at most two lines, `text-wrap: pretty` so a short last line does not dangle.
 */
export function CollectionSupportingLine({
  children,
  className,
  title,
}: CollectionSupportingLineProps) {
  return (
    <Typography
      {...(title ? { title } : {})}
      as="p"
      variant="body-sm"
      data-collection-supporting
      className={cn('line-clamp-2 min-w-0 text-content-secondary [text-wrap:pretty]', className)}
    >
      {children}
    </Typography>
  );
}
