import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Behaviour tests for the appearance policy. The package unit tests run without a DOM, so React's
 * ref/layout-effect primitives are replaced by a minimal single-instance harness: refs persist
 * across renders and a layout effect re-runs (after its previous cleanup) when its deps change.
 */
const harness = vi.hoisted(() => {
  let refs: { current: unknown }[] = [];
  let refIndex = 0;
  let effectDeps: unknown[] | undefined;
  let cleanup: void | (() => void);

  return {
    reset() {
      refs = [];
      effectDeps = undefined;
      cleanup = undefined;
    },
    beginRender() {
      refIndex = 0;
    },
    useRef<T>(initial: T) {
      refs[refIndex] ??= { current: initial };

      return refs[refIndex++] as { current: T };
    },
    useLayoutEffect(effect: () => void | (() => void), deps: unknown[]) {
      if (effectDeps && deps.every((value, index) => Object.is(value, effectDeps![index]))) {
        return;
      }

      effectDeps = deps;
      if (typeof cleanup === 'function') {
        cleanup();
      }

      cleanup = effect();
    },
  };
});

vi.mock('react', () => ({ useRef: harness.useRef, useLayoutEffect: harness.useLayoutEffect }));

const { useInitialAppearance } = await import('./useInitialAppearance');

function fakeRegion(workspaceMotion?: string) {
  const classes = new Set<string>();

  return {
    classes,
    node: {
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
      },
      closest: () =>
        workspaceMotion === undefined ? null : { getAttribute: () => workspaceMotion },
    },
  };
}

const appearance = 'initial-content-appearance';

describe('useInitialAppearance', () => {
  beforeEach(() => harness.reset());

  function setup(workspaceMotion?: string) {
    const region = fakeRegion(workspaceMotion);
    const render = (identity: string, loading: boolean, ready: boolean) => {
      harness.beginRender();
      const ref = useInitialAppearance(identity, loading, ready);
      ref.current = region.node as unknown as HTMLDivElement;
    };

    return { render, has: () => region.classes.has(appearance) };
  }

  it('reveals the first ready result once after a committed placeholder', () => {
    const view = setup();
    view.render('spec-a', true, false);
    expect(view.has()).toBe(false);
    view.render('spec-a', false, true);
    expect(view.has()).toBe(true);
  });

  it('renders cached content immediately without an appearance', () => {
    const view = setup();
    view.render('spec-a', false, true);
    expect(view.has()).toBe(false);
  });

  it('does not replay on an ordinary refetch of the same resource', () => {
    const view = setup();
    view.render('spec-a', true, false);
    view.render('spec-a', false, true);
    view.render('spec-a', true, true);
    view.render('spec-a', false, true);
    // The effect re-ran (deps changed) and cleaned up the one-shot class without re-adding it.
    expect(view.has()).toBe(false);
  });

  it('resets tracking when the resource identity changes', () => {
    const view = setup();
    view.render('spec-a', true, false);
    view.render('spec-a', false, true);
    expect(view.has()).toBe(true);
    view.render('spec-b', true, false);
    expect(view.has()).toBe(false);
    view.render('spec-b', false, true);
    expect(view.has()).toBe(true);
  });

  it('treats a cached switch to a new identity as immediate', () => {
    const view = setup();
    view.render('spec-a', true, false);
    view.render('spec-a', false, true);
    view.render('spec-b', false, true);
    expect(view.has()).toBe(false);
  });

  it('is suppressed while the workspace layer is transitioning', () => {
    const view = setup('entering');
    view.render('spec-a', true, false);
    view.render('spec-a', false, true);
    expect(view.has()).toBe(false);
  });

  it('runs inside an idle workspace layer', () => {
    const view = setup('idle');
    view.render('spec-a', true, false);
    view.render('spec-a', false, true);
    expect(view.has()).toBe(true);
  });

  it('never appears for a blocking error (loading ends without ready content)', () => {
    const view = setup();
    view.render('spec-a', true, false);
    view.render('spec-a', false, false);
    expect(view.has()).toBe(false);
  });
});
