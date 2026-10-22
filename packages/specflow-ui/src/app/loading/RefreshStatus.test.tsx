// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RefreshStatus } from './RefreshStatus';

describe('RefreshStatus', () => {
  it('announces the label as text of the live region while active', () => {
    const { rerender } = render(<RefreshStatus active={false} label="Refreshing…" />);
    expect(screen.getByRole('status').textContent).toBe('');
    rerender(<RefreshStatus active label="Refreshing…" />);
    expect(screen.getByRole('status').textContent).toBe('Refreshing…');
  });
});
