// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BreadcrumbItem, Breadcrumbs } from './Breadcrumbs';

function mockWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width,
    height: 28,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: 28,
    toJSON: () => ({}),
  }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Trail({ onPress }: { onPress: (level: number) => void }) {
  return (
    <Breadcrumbs collapsedLabel="Show hidden levels" label="Panel location" overflow="collapse">
      <BreadcrumbItem onPress={() => onPress(1)}>Tasks</BreadcrumbItem>
      <BreadcrumbItem onPress={() => onPress(2)}>TASK-03</BreadcrumbItem>
      <BreadcrumbItem>Review of a very long change title that must truncate</BreadcrumbItem>
    </Breadcrumbs>
  );
}

describe('Breadcrumbs interaction', () => {
  it('renders onPress ancestors as buttons and the current page as plain text with its full title', () => {
    mockWidth(800);
    const onPress = vi.fn();
    render(<Trail onPress={onPress} />);

    fireEvent.click(screen.getByRole('button', { name: 'TASK-03' }));
    expect(onPress).toHaveBeenCalledWith(2);

    const current = document.querySelector('[aria-current="page"]')!;
    expect(current.tagName).toBe('SPAN');
    expect(current.className).toContain('truncate');
    expect(current.getAttribute('title')).toBe(
      'Review of a very long change title that must truncate',
    );
    expect(screen.queryByRole('button', { name: 'Show hidden levels' })).toBeNull();
  });

  it('collapses the middle segments into a … menu when narrow, which still reaches them', async () => {
    mockWidth(330);
    const onPress = vi.fn();
    render(<Trail onPress={onPress} />);

    const nav = screen.getByRole('navigation', { name: 'Panel location' });
    expect(within(nav).getByRole('button', { name: 'Tasks' })).toBeTruthy();
    expect(within(nav).queryByRole('button', { name: 'TASK-03' })).toBeNull();

    const trigger = within(nav).getByRole('button', { name: 'Show hidden levels' });
    await act(async () => {
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'Enter' });
      await Promise.resolve();
    });
    const item = within(screen.getByRole('menu')).getByRole('menuitem', { name: 'TASK-03' });
    await act(async () => {
      fireEvent.click(item);
      await Promise.resolve();
    });
    expect(onPress).toHaveBeenCalledWith(2);
  });

  it('keeps the default wrap layout unchanged', () => {
    mockWidth(200);
    render(
      <Breadcrumbs>
        <BreadcrumbItem href="/a">A</BreadcrumbItem>
        <BreadcrumbItem href="/b">B</BreadcrumbItem>
        <BreadcrumbItem>C</BreadcrumbItem>
      </Breadcrumbs>,
    );

    expect(document.querySelector('ol')!.className).toContain('flex-wrap');
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});
