// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocsSearchField } from './DocsSearchField';

function renderField(pointer: 'coarse' | 'fine') {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: query === `(pointer: ${pointer})` }) as MediaQueryList,
  );
  const onChange = vi.fn();
  render(
    <>
      <DocsSearchField
        inputRef={null}
        label="Search documentation"
        maxLength={500}
        value="session"
        onChange={onChange}
        onClear={() => undefined}
      />
      <p>results</p>
    </>,
  );
  const field = screen.getByRole('searchbox');
  field.focus();

  return { field, onChange };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DocsSearchField', () => {
  it('closes the software keyboard on Enter and keeps the text', () => {
    const { field, onChange } = renderField('coarse');
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(document.activeElement).not.toBe(field);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the focus on Enter with a hardware keyboard', () => {
    const { field } = renderField('fine');
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(document.activeElement).toBe(field);
  });

  it('closes the keyboard when a touch drag scrolls the results, not when it starts on the field', () => {
    const { field, onChange } = renderField('coarse');
    fireEvent.touchMove(field);
    expect(document.activeElement).toBe(field);

    fireEvent.touchMove(screen.getByText('results'));
    expect(document.activeElement).not.toBe(field);
    expect(onChange).not.toHaveBeenCalled();
  });
});
