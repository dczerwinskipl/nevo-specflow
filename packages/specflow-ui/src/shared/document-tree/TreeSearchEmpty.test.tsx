// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TreeSearchEmpty } from './TreeSearchEmpty';

afterEach(cleanup);

describe('TreeSearchEmpty', () => {
  it('says nothing matches without an icon and offers one way out', () => {
    const onClear = vi.fn();
    const { container } = render(
      <TreeSearchEmpty
        title="No matching files"
        description="Change the search or the chosen types."
        clearLabel="Clear filters"
        onClear={onClear}
      />,
    );

    expect(container.querySelector('[data-empty-state="inline"]')).toBeTruthy();
    expect(container.querySelector('[data-design-slot="icon"]')).toBeNull();
    expect(screen.getByText('No matching files')).toBeTruthy();
    expect(screen.getByText('Change the search or the chosen types.')).toBeTruthy();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(onClear).toHaveBeenCalledOnce();
  });
});
