/**
 * Shared geometry of the Create forms (project and demo).
 *
 * The form is one column below a 992 px (`62rem`) form column and two columns from it: what is
 * created on the left, who starts it and where on the right. The threshold is a container query on
 * the form column (the `@container` of `CreateShell`'s content), never a viewport breakpoint, so
 * the same rule holds with the navigation open or closed and at any zoom. Below the threshold the
 * form keeps its reading column (`content-form`); from it the form grows to at most two control
 * widths and the gap between them (`72rem` = 2 x 34rem + 4rem), so each column, and everything in it
 * (tiles, provider cards, Git rows, fields), shares one edge with the controls and the form never
 * stretches with the frame. `createFormWidth` is that width rule, for the form and for the footer
 * that has to end on the form's edge.
 */
export const createFormWidth = 'max-w-content-form @min-[62rem]:max-w-288';

/** The two columns themselves (inside a block of `createFormWidth`). */
export const createFormColumns =
  'grid gap-8 @min-[62rem]:grid-cols-2 @min-[62rem]:gap-x-16 @min-[62rem]:items-start';

/**
 * One of the columns: its own `@container`, so what it holds (the workspace tiles, the provider
 * cards) chooses its layout from the column's width, not from the whole form's.
 */
export const createFormColumn = '@container grid min-w-0 content-start gap-8';

/**
 * The largest width of a Create control (text input, text area, picker group, the agent's provider
 * cards and fields, the Git rows): about 34rem, so a control never grows with the frame. Two of them
 * and the column gap are the two-column form's width (`createFormWidth`).
 */
export const createControlWidth = 'w-full max-w-136';
