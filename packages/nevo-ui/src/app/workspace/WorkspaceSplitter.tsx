import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '../../lib';
import {
  fastColorTransitionClassName,
  hitAreaClassName,
} from '../../design-system/interactionRecipes';
import { WORKSPACE_SPLITTER_KEYBOARD_STEP_PX } from './workspaceSizing';

export interface WorkspaceSplitterProps {
  /** Secondary's current share of the split, 0-1 (workspace-dynamic-split.md §4.2). */
  secondaryRatio: number;
  /** Minimum valid `secondaryRatio` for the current `availableWidth`. */
  minSecondaryRatio: number;
  /** Maximum valid `secondaryRatio` for the current `availableWidth`. */
  maxSecondaryRatio: number;
  /**
   * Combined Primary + Secondary content width in px. Used only to convert a pointer/touch drag's
   * pixel delta, and the keyboard step, into a ratio delta — never read as a layout decision here.
   */
  availableWidth: number;
  /**
   * Called with the next (already clamped) ratio on every live update: a pointer/touch move or a
   * keyboard adjustment. The caller owns persisting the value and entering `mode: 'manual'`
   * (contract §5) — this component only ever reports a ratio, never a mode.
   */
  onSecondaryRatioChange: (ratio: number) => void;
  /** Accessible name (contract §7), sourced from `AppWorkspaceLabels.resizeSecondary`. */
  label: string;
  className?: string;
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startRatio: number;
}

function clampRatio(ratio: number, min: number, max: number): number {
  if (min > max) {
    return ratio;
  }

  return Math.min(Math.max(ratio, min), max);
}

/**
 * `AppWorkspace`'s draggable Primary/Secondary splitter (workspace-dynamic-split.md §4.3, §7): a
 * focusable `role="separator"` window-splitter, not a styled `Separator` (contract §2 — `Separator`
 * is deliberately not reused/extended here). `AppWorkspace` is the only renderer of this component
 * (it is not a standalone public layout primitive); it owns `secondaryRatio`/the min-max bounds and
 * decides when to show it (only `split="dynamic"` resolved to `layout: 'split'`).
 *
 * Pointer/touch drag uses `pointerdown`/`pointermove`/`pointerup` (not HTML5 drag-and-drop), so mouse,
 * pen and touch all go through the same path; `touch-action: none` on the hit area stops the browser
 * from treating a touch drag as a page/pane scroll gesture. The 44px coarse-pointer hit area reuses
 * `hitAreaClassName` (the same `ItemTabs` close-button precedent), centred on a 1px visual line.
 */
export function WorkspaceSplitter({
  secondaryRatio,
  minSecondaryRatio,
  maxSecondaryRatio,
  availableWidth,
  onSecondaryRatioChange,
  label,
  className,
}: WorkspaceSplitterProps) {
  const dragRef = useRef<DragState | null>(null);

  const clamp = (ratio: number) => clampRatio(ratio, minSecondaryRatio, maxSecondaryRatio);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Primary mouse button only; every touch/pen contact point is its own pointer id regardless.
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startRatio: secondaryRatio,
    };
    try {
      // Pointer capture keeps receiving move/up even if the pointer leaves the thin hit area
      // mid-drag. Some environments (synthetic pointer ids, certain embedders) refuse capture for
      // a pointer id they do not recognise as active; the drag still works via normal bubbling, so
      // this is best-effort, not required for correctness.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignored: see above.
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId || availableWidth <= 0) {
      return;
    }

    // Secondary sits to the right of the splitter (contract §6/§4.2 — no side-swap in this task):
    // moving the pointer right shrinks Secondary's share, left grows it.
    const deltaRatio = (event.clientX - drag.startClientX) / availableWidth;
    onSecondaryRatioChange(clamp(drag.startRatio - deltaRatio));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Best-effort release; see the matching try/catch in onPointerDown.
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const stepRatio =
      availableWidth > 0 ? WORKSPACE_SPLITTER_KEYBOARD_STEP_PX / availableWidth : 0.02;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        onSecondaryRatioChange(clamp(secondaryRatio + stepRatio));
        break;
      case 'ArrowRight':
        event.preventDefault();
        onSecondaryRatioChange(clamp(secondaryRatio - stepRatio));
        break;
      case 'Home':
        event.preventDefault();
        onSecondaryRatioChange(minSecondaryRatio);
        break;
      case 'End':
        event.preventDefault();
        onSecondaryRatioChange(maxSecondaryRatio);
        break;
      default:
        break;
      // Every other key (notably Tab/Shift+Tab) is left untouched: the splitter must not trap focus.
    }
  };

  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={Math.round(maxSecondaryRatio * 100)}
      aria-valuemin={Math.round(minSecondaryRatio * 100)}
      aria-valuenow={Math.round(secondaryRatio * 100)}
      className={cn(
        hitAreaClassName,
        'z-10 w-px shrink-0 cursor-col-resize touch-none self-stretch bg-border-subtle outline-none',
        'select-none hover:bg-border-strong',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
        fastColorTransitionClassName,
        className,
      )}
      data-workspace-splitter="true"
      onKeyDown={onKeyDown}
      onLostPointerCapture={() => {
        dragRef.current = null;
      }}
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      role="separator"
      tabIndex={0}
    />
  );
}
