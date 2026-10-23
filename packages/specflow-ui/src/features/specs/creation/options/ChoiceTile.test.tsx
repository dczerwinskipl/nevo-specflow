// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoiceTile, ChoiceTileGroup } from './ChoiceTile';

afterEach(cleanup);

function renderGroup(onSelect = vi.fn<(value: string) => void>(), checkedValue = 'new') {
  render(
    <>
      <h2 id="place">Where to work</h2>
      <ChoiceTileGroup aria-labelledby="place" columns="@2xl:grid-cols-3">
        <ChoiceTile
          name="place"
          value="new"
          checked={checkedValue === 'new'}
          onSelect={() => onSelect('new')}
          icon={<svg data-testid="icon-new" />}
          title="New workspace"
          description="A new branch in its own worktree."
          meta={<span>Recommended</span>}
        />
        <ChoiceTile
          name="place"
          value="existing"
          checked={false}
          blocked
          onSelect={() => onSelect('existing')}
          icon={<svg />}
          title="Existing workspace"
          description="No other workspace is available."
        />
        <ChoiceTile
          name="place"
          value="main"
          checked={false}
          disabled
          onSelect={() => onSelect('main')}
          icon={<svg />}
          title="Current directory"
          note="Unavailable for now."
        />
      </ChoiceTileGroup>
    </>,
  );
  return onSelect;
}

describe('ChoiceTile', () => {
  it('is one radio group named by its heading, each radio named by its title', () => {
    renderGroup();
    const group = screen.getByRole('radiogroup', { name: 'Where to work' });
    expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'New workspace' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Existing workspace' })).toBeTruthy();
  });

  it('describes the radio by the explanation, not by the facts', () => {
    renderGroup();
    const described = screen
      .getByRole('radio', { name: 'New workspace' })
      .getAttribute('aria-describedby');
    expect(document.getElementById(described ?? '')?.textContent).toBe(
      'A new branch in its own worktree.',
    );
    expect(
      screen.getByRole('radio', { name: 'Current directory' }).hasAttribute('aria-describedby'),
    ).toBe(false);
  });

  it('reports the choice of an available tile', () => {
    const onSelect = renderGroup(undefined, 'none');
    fireEvent.click(screen.getByRole('radio', { name: 'New workspace' }));
    expect(onSelect).toHaveBeenCalledWith('new');
  });

  it('does not select a blocked tile', () => {
    const onSelect = renderGroup();
    fireEvent.click(screen.getByRole('radio', { name: 'Existing workspace' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks a blocked tile aria-disabled but keeps it reachable, a disabled one is skipped', () => {
    renderGroup();
    const blocked = screen.getByRole('radio', { name: 'Existing workspace' });
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    expect((blocked as HTMLInputElement).disabled).toBe(false);
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Current directory' }).disabled,
    ).toBe(true);
  });

  it('never selects a natively disabled tile', () => {
    const onSelect = renderGroup();
    fireEvent.click(screen.getByRole('radio', { name: 'Current directory' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps the geometry stable: the check is always rendered, hidden when not selected', () => {
    renderGroup();
    const checks = document.querySelectorAll('label > span[aria-hidden="true"]');
    expect([...checks].map((check) => check.classList.contains('invisible'))).toEqual([
      false,
      true,
      true,
    ]);
  });
});
