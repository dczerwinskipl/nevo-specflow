// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceSplitter, type WorkspaceSplitterProps } from './WorkspaceSplitter';

afterEach(() => {
  cleanup();
});

/** Mirrors `AppWorkspace`'s own uncontrolled-ratio wiring, so tests exercise live drag/keyboard feedback. */
function ControlledSplitter(
  props: Partial<Omit<WorkspaceSplitterProps, 'secondaryRatio' | 'onSecondaryRatioChange'>> & {
    initialRatio?: number;
    onChange?: (ratio: number) => void;
  },
) {
  const [ratio, setRatio] = useState(props.initialRatio ?? 0.5);

  return (
    <WorkspaceSplitter
      availableWidth={1000}
      label="Resize secondary panel"
      maxSecondaryRatio={0.75}
      minSecondaryRatio={0.25}
      {...props}
      secondaryRatio={ratio}
      onSecondaryRatioChange={(next) => {
        setRatio(next);
        props.onChange?.(next);
      }}
    />
  );
}

function getSplitter() {
  return screen.getByRole('separator', { name: 'Resize secondary panel' });
}

describe('WorkspaceSplitter', () => {
  it('renders window-splitter ARIA attributes reflecting the live split', () => {
    render(<ControlledSplitter initialRatio={0.5} />);

    const splitter = getSplitter();
    expect(splitter.getAttribute('aria-orientation')).toBe('vertical');
    expect(splitter.getAttribute('aria-valuenow')).toBe('50');
    expect(splitter.getAttribute('aria-valuemin')).toBe('25');
    expect(splitter.getAttribute('aria-valuemax')).toBe('75');
  });

  it('updates aria-valuenow live as the controlled ratio changes', () => {
    const { rerender } = render(
      <WorkspaceSplitter
        availableWidth={1000}
        label="Resize secondary panel"
        maxSecondaryRatio={0.75}
        minSecondaryRatio={0.25}
        onSecondaryRatioChange={() => undefined}
        secondaryRatio={0.5}
      />,
    );

    expect(getSplitter().getAttribute('aria-valuenow')).toBe('50');

    rerender(
      <WorkspaceSplitter
        availableWidth={1000}
        label="Resize secondary panel"
        maxSecondaryRatio={0.75}
        minSecondaryRatio={0.25}
        onSecondaryRatioChange={() => undefined}
        secondaryRatio={0.6}
      />,
    );

    expect(getSplitter().getAttribute('aria-valuenow')).toBe('60');
  });

  it('is focusable with tabIndex 0 and does not trap focus', () => {
    render(
      <div>
        <button type="button">Before</button>
        <ControlledSplitter initialRatio={0.5} />
        <button type="button">After</button>
      </div>,
    );

    const splitter = getSplitter();
    expect(splitter.getAttribute('tabindex')).toBe('0');

    splitter.focus();
    expect(document.activeElement).toBe(splitter);

    // The splitter never intercepts Tab/Shift+Tab: it leaves default browser focus movement alone.
    fireEvent.keyDown(splitter, { key: 'Tab' });
    expect(document.activeElement).toBe(splitter);
  });

  it('shows a visible focus-visible treatment (outline-* classes) when focused', () => {
    render(<ControlledSplitter initialRatio={0.5} />);

    const splitter = getSplitter();
    expect(splitter.className).toMatch(/focus-visible:outline-2/);
    expect(splitter.className).toMatch(/focus-visible:outline-focus-ring/);
    // On a plain focusable <div> (unlike the button-based DS precedents this idiom is copied
    // from), an unconditional `outline-none` class silently defeats `focus-visible:outline-2`:
    // Tailwind's generated rule for `outline-none` sets `--tw-outline-style: none` with no
    // `:focus-visible` gate, which the focus-visible outline-width rule reads via `var()`, so the
    // ring never renders (verified live in a real browser). Guard against reintroducing it.
    expect(splitter.className).not.toMatch(/(^|\s)outline-none(\s|$)/);
  });

  it('sets touch-action: none and a 44px-equivalent hit area for coarse pointers', () => {
    render(<ControlledSplitter initialRatio={0.5} />);

    const splitter = getSplitter();
    expect(splitter.className).toMatch(/touch-none/);
    // Reuses the shared hit-area recipe (ItemTabs' close-button precedent), not a bespoke one.
    expect(splitter.className).toContain('after:size-[max(100%,var(--target-size))]');
  });

  it.each([
    ['ArrowLeft', 0.52],
    ['ArrowRight', 0.48],
  ] as const)('%s adjusts the ratio by a fixed step', (key, expected) => {
    render(<ControlledSplitter availableWidth={1200} initialRatio={0.5} />);

    fireEvent.keyDown(getSplitter(), { key });

    expect(getSplitter().getAttribute('aria-valuenow')).toBe(String(Math.round(expected * 100)));
  });

  it('Home jumps to the minimum valid ratio', () => {
    render(
      <ControlledSplitter initialRatio={0.5} maxSecondaryRatio={0.75} minSecondaryRatio={0.25} />,
    );

    fireEvent.keyDown(getSplitter(), { key: 'Home' });

    expect(getSplitter().getAttribute('aria-valuenow')).toBe('25');
  });

  it('End jumps to the maximum valid ratio', () => {
    render(
      <ControlledSplitter initialRatio={0.5} maxSecondaryRatio={0.75} minSecondaryRatio={0.25} />,
    );

    fireEvent.keyDown(getSplitter(), { key: 'End' });

    expect(getSplitter().getAttribute('aria-valuenow')).toBe('75');
  });

  it('keyboard adjustment never exceeds the valid [min, max] range', () => {
    render(
      <ControlledSplitter initialRatio={0.74} maxSecondaryRatio={0.75} minSecondaryRatio={0.25} />,
    );

    fireEvent.keyDown(getSplitter(), { key: 'ArrowLeft' });
    fireEvent.keyDown(getSplitter(), { key: 'ArrowLeft' });

    const now = Number(getSplitter().getAttribute('aria-valuenow'));
    expect(now).toBeLessThanOrEqual(75);
  });

  it('pointer drag sets the ratio live and clamps to the valid range', () => {
    const onChange = vi.fn();
    render(<ControlledSplitter availableWidth={1000} initialRatio={0.5} onChange={onChange} />);

    const splitter = getSplitter();
    (splitter as unknown as { setPointerCapture: () => void }).setPointerCapture = () => undefined;
    (splitter as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
    (splitter as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () =>
      undefined;

    fireEvent.pointerDown(splitter, { pointerId: 1, clientX: 500 });
    // Dragging the splitter 100px to the right shrinks Secondary's share by 100/1000 = 0.1.
    fireEvent.pointerMove(splitter, { pointerId: 1, clientX: 600 });

    expect(onChange).toHaveBeenCalledWith(0.4);
    expect(getSplitter().getAttribute('aria-valuenow')).toBe('40');

    fireEvent.pointerUp(splitter, { pointerId: 1, clientX: 600 });
  });
});
