// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFocusRequest } from './useFocusRequest';

afterEach(cleanup);

function Panel() {
  const [open, setOpen] = useState(false);
  const focusField = useFocusRequest<string>((field) => {
    document.getElementById(field)?.focus();
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          focusField('field');
        }}
      >
        open
      </button>
      {open && <input id="field" aria-label="field" />}
    </div>
  );
}

describe('useFocusRequest', () => {
  it('focuses an element that only exists after the render the same event caused', () => {
    render(<Panel />);
    act(() => screen.getByRole('button', { name: 'open' }).click());
    expect(document.activeElement).toBe(screen.getByLabelText('field'));
  });

  it('a repeated request focuses again', () => {
    render(<Panel />);
    act(() => screen.getByRole('button', { name: 'open' }).click());
    screen.getByRole('button', { name: 'open' }).focus();
    act(() => screen.getByRole('button', { name: 'open' }).click());
    expect(document.activeElement).toBe(screen.getByLabelText('field'));
  });
});
