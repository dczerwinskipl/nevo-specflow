/**
 * The popover of a context switcher: one width and one padding (`PopoverContent` already clamps
 * itself to the available width, so no viewport clamp). Use it with `motion="navigation"` and
 * `inert`/`aria-hidden` while closed (the popover stays mounted while it animates out).
 */
export const contextSwitcherPopoverClassName = 'w-80 p-3';
