// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextSwitcherOption } from './ContextSwitcherOption';
import { ContextSwitcherTrigger } from './ContextSwitcherTrigger';

// Every character 10 px wide, in place of the canvas measurement jsdom does not have.
vi.mock('../text-measure/measureText', () => ({
  textMeasurer: () => (text: string) => text.length * 10,
}));

let nameWidth = 200;

beforeEach(() => {
  nameWidth = 200;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const width = this.hasAttribute('data-context-switcher-name') ? nameWidth : 0;

    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0 } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const longWorktree = 'feature-workspace-aware-documentation-review-mobile';

describe('ContextSwitcherTrigger', () => {
  it('cuts an identifier-like name in the middle, keeps its end and announces the full name', async () => {
    render(
      <ContextSwitcherTrigger label="Workspace" name={longWorktree} segments={['Worktree']} />,
    );
    const trigger = screen.getByRole('button', { name: new RegExp(longWorktree) });
    const name = trigger.querySelector('[data-context-switcher-name]')!;
    expect(name.getAttribute('data-context-switcher-name')).toBe('middle');
    expect(name.querySelector('[aria-hidden]')?.textContent).toBe('feature-work…-mobile');

    act(() => trigger.focus());
    expect((await screen.findByRole('tooltip')).textContent).toBe(longWorktree);
  });

  it('shows a name that fits whole, without a tooltip', () => {
    render(<ContextSwitcherTrigger label="Workspace" name="docs-reader" />);
    const trigger = screen.getByRole('button');
    expect(trigger.querySelector('[data-context-switcher-name]')?.textContent).toBe('docs-reader');

    act(() => trigger.focus());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows the whole name before layout (no width yet) and re-measures once fonts are ready', async () => {
    nameWidth = 0;
    let fontsReady!: () => void;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: new Promise<void>((resolve) => (fontsReady = resolve)) },
    });
    render(<ContextSwitcherTrigger label="Workspace" name={longWorktree} />);
    const name = screen.getByRole('button').querySelector('[data-context-switcher-name]')!;
    expect(name.textContent).toBe(longWorktree);

    nameWidth = 200;
    await act(async () => {
      fontsReady();
      await Promise.resolve();
    });
    expect(name.querySelector('[aria-hidden]')?.textContent).toBe('feature-work…-mobile');
    Reflect.deleteProperty(document, 'fonts');
  });

  it('leaves a prose name to the CSS end cut', () => {
    render(
      <ContextSwitcherTrigger
        label="Current specification"
        name="Workspace-aware documentation reader with search refinement"
        segments={['DOC-143']}
      />,
    );
    const name = screen.getByRole('button').querySelector('[data-context-switcher-name]')!;
    expect(name.getAttribute('data-context-switcher-name')).toBe('end');
    expect(name.textContent).toBe('Workspace-aware documentation reader with search refinement');
  });

  it('renders the status slot after the name and the segments on one line', () => {
    render(
      <ContextSwitcherTrigger
        label="Workspace"
        name="repo"
        segments={['Project folder', "this Session's workspace"]}
        status={{ tone: 'attention', text: 'Local changes' }}
      />,
    );
    const trigger = screen.getByRole('button');
    const status = trigger.querySelector('[data-context-switcher-status="attention"]');
    expect(status?.textContent).toBe('Local changes');
    expect(status?.querySelector('.bg-status-attention')).not.toBeNull();
    expect(trigger.querySelector('[data-context-switcher-segments]')?.textContent).toBe(
      "Project folder · this Session's workspace",
    );
  });

  it('offers a note in the tooltip even when the name shows whole', async () => {
    render(<ContextSwitcherTrigger label="Workspace" name="repo" note="." />);
    const trigger = screen.getByRole('button');
    act(() => trigger.focus());
    expect((await screen.findByRole('tooltip')).textContent).toBe('.');
  });

  it('keeps the tooltip closed when focus returns from the popover, until focus moves on', async () => {
    const view = render(
      <ContextSwitcherTrigger label="Workspace" name={longWorktree} aria-expanded />,
    );
    view.rerender(
      <ContextSwitcherTrigger label="Workspace" name={longWorktree} aria-expanded={false} />,
    );
    const trigger = screen.getByRole('button');
    act(() => trigger.focus());
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => trigger.blur());
    act(() => trigger.focus());
    expect((await screen.findByRole('tooltip')).textContent).toBe(longWorktree);
  });
});

describe('ContextSwitcherOption', () => {
  it('shows an unavailable option with the danger dot and its reason, muted and announced', () => {
    render(
      <ContextSwitcherOption
        name="spike-provider-limits"
        segments={['Worktree']}
        status={{ tone: 'danger', text: 'Folder unavailable' }}
        selected={false}
        unavailable
      />,
    );
    const option = screen.getByRole('option', { name: /spike-provider-limits/ });
    expect(option.getAttribute('aria-disabled')).toBe('true');
    const status = option.querySelector('[data-context-switcher-status="danger"]');
    expect(status?.textContent).toBe('Folder unavailable');
    expect(status?.querySelector('.bg-status-danger')).not.toBeNull();
  });
});
