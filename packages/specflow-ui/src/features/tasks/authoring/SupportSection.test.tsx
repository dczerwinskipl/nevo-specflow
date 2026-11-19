// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OPEN_UP_TO, SupportSection, startsOpen } from './SupportSection';
import { SupportSectionStateProvider } from './supportSectionState';

afterEach(cleanup);

describe('startsOpen', () => {
  it('opens a section with few items or a blocker, at every width', () => {
    expect(startsOpen(3, OPEN_UP_TO.documents, false)).toBe(true);
    expect(startsOpen(4, OPEN_UP_TO.documents, false)).toBe(false);
    expect(startsOpen(4, OPEN_UP_TO.entries, false)).toBe(true);
    expect(startsOpen(5, OPEN_UP_TO.entries, false)).toBe(false);
    expect(startsOpen(9, OPEN_UP_TO.entries, true)).toBe(true);
  });
});

function section(taskId: string, items: number) {
  return (
    <SupportSection
      id="docs-heading"
      title="Documents"
      icon="file"
      taskId={taskId}
      count={items}
      summary={`${items} · task.md, plan.md, +${items - 2}`}
      items={items}
      openUpTo={OPEN_UP_TO.documents}
    >
      <p>rows</p>
    </SupportSection>
  );
}

describe('SupportSection', () => {
  it('collapses above the limit with the summary, and keeps the toggle per Task for the visit', () => {
    const { rerender } = render(
      <SupportSectionStateProvider>{section('a', 5)}</SupportSectionStateProvider>,
    );
    const trigger = screen.getByRole('button', { name: /Documents/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('5 · task.md, plan.md, +3');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.textContent).not.toContain('task.md');

    // Another Task starts from its own facts; coming back keeps the first Task's choice.
    rerender(<SupportSectionStateProvider>{section('b', 5)}</SupportSectionStateProvider>);
    expect(screen.getByRole('button', { name: /Documents/ }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    rerender(<SupportSectionStateProvider>{section('a', 5)}</SupportSectionStateProvider>);
    expect(screen.getByRole('button', { name: /Documents/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });
});
