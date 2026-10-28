// @vitest-environment jsdom
import type { FormEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRevealFailure } from './useRevealFailure';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const box = (top: number, bottom: number) =>
  ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top }) as DOMRect;

/** A scroll area holding the action region, a submit button and what the layout reports. */
function layout({
  buttonInView,
  regionHeight = 100,
}: {
  buttonInView: boolean;
  regionHeight?: number;
}) {
  const scroller = document.createElement('div');
  scroller.className = 'scroll-area-viewport';
  Object.defineProperty(scroller, 'clientHeight', { value: 400 });
  scroller.getBoundingClientRect = () => box(0, 400);
  const region = document.createElement('div');
  Object.defineProperty(region, 'offsetHeight', { value: regionHeight });
  const scrollIntoView = vi.fn();
  region.scrollIntoView = scrollIntoView;
  const submitter = document.createElement('button');
  submitter.getBoundingClientRect = () => (buttonInView ? box(300, 340) : box(900, 940));
  scroller.append(region, submitter);
  document.body.append(scroller);
  return { scroller, region, submitter, scrollIntoView };
}

function submitEvent(submitter: HTMLElement) {
  return {
    nativeEvent: new SubmitEvent('submit', { submitter }),
  } as unknown as FormEvent<HTMLFormElement>;
}

function setup(parts: ReturnType<typeof layout>) {
  const view = renderHook(({ failed, seq }) => useRevealFailure(failed, seq, { kind: 'failed' }), {
    initialProps: { failed: false, seq: 0 },
  });
  view.result.current.actionRegion.current = parts.region;
  return view;
}

const flush = () =>
  act(() => {
    vi.advanceTimersByTime(20);
  });

describe('useRevealFailure', () => {
  it('scrolls a short failure region to the end of the view after a submit made from inside the view', () => {
    const parts = layout({ buttonInView: true });
    const view = setup(parts);
    view.result.current.captureSubmit(submitEvent(parts.submitter));
    view.rerender({ failed: true, seq: 1 });
    flush();
    expect(parts.scrollIntoView).toHaveBeenCalledWith({ block: 'end' });
  });

  it('aligns a region taller than the view to its start so the alert is read from the top', () => {
    const parts = layout({ buttonInView: true, regionHeight: 900 });
    const view = setup(parts);
    view.result.current.captureSubmit(submitEvent(parts.submitter));
    view.rerender({ failed: true, seq: 1 });
    flush();
    expect(parts.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('never fights the user: no scroll when they scrolled since the submit', () => {
    const parts = layout({ buttonInView: true });
    const view = setup(parts);
    view.result.current.captureSubmit(submitEvent(parts.submitter));
    parts.scroller.scrollTop = 120;
    view.rerender({ failed: true, seq: 1 });
    flush();
    expect(parts.scrollIntoView).not.toHaveBeenCalled();
  });

  it('with the pinned footer, reveals the failure only when the form was scrolled to its end', () => {
    const parts = layout({ buttonInView: false });
    // The footer sits under the scroll area, never scrolled away.
    document.body.append(parts.submitter);
    Object.defineProperty(parts.scroller, 'scrollHeight', { value: 1200 });
    parts.scroller.scrollTop = 800;
    const view = setup(parts);
    view.result.current.captureSubmit(submitEvent(parts.submitter));
    view.rerender({ failed: true, seq: 1 });
    flush();
    expect(parts.scrollIntoView).toHaveBeenCalledWith({ block: 'end' });
  });

  it('with the pinned footer, leaves the owner where they read when the end was not in view', () => {
    const parts = layout({ buttonInView: false });
    document.body.append(parts.submitter);
    Object.defineProperty(parts.scroller, 'scrollHeight', { value: 1200 });
    const view = setup(parts);
    view.result.current.captureSubmit(submitEvent(parts.submitter));
    view.rerender({ failed: true, seq: 1 });
    flush();
    expect(parts.scrollIntoView).not.toHaveBeenCalled();
  });

  it('does nothing when the submit button was not in view (the owner was elsewhere)', () => {
    const parts = layout({ buttonInView: false });
    const view = setup(parts);
    view.result.current.captureSubmit(submitEvent(parts.submitter));
    view.rerender({ failed: true, seq: 1 });
    flush();
    expect(parts.scrollIntoView).not.toHaveBeenCalled();
  });

  it('does nothing without a failure, and drops a pending scroll when unmounted', () => {
    const parts = layout({ buttonInView: true });
    const view = setup(parts);
    view.result.current.captureSubmit(submitEvent(parts.submitter));
    view.rerender({ failed: false, seq: 1 });
    flush();
    expect(parts.scrollIntoView).not.toHaveBeenCalled();
    view.rerender({ failed: true, seq: 2 });
    view.unmount();
    flush();
    expect(parts.scrollIntoView).not.toHaveBeenCalled();
  });
});
