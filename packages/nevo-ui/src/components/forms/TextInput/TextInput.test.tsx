import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { textControlDesignState } from '../shared/textControlState';
import { TextInput } from './TextInput';

describe('TextInput', () => {
  it('preserves native naming, value and invalid state', () => {
    const markup = renderToStaticMarkup(
      <TextInput
        aria-invalid="true"
        aria-label="Company"
        onChange={() => undefined}
        value="Nevo"
      />,
    );
    expect(markup.startsWith('<input')).toBe(true);
    expect(markup).toContain('aria-label="Company"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('value="Nevo"');
  });

  it('prioritizes canonical design states deterministically', () => {
    expect(textControlDesignState({ autoFocus: true })).toBe('focus');
    expect(textControlDesignState({ ariaInvalid: true, autoFocus: true })).toBe('invalid');
    expect(textControlDesignState({ ariaInvalid: true, autoFocus: true, disabled: true })).toBe(
      'disabled',
    );
  });
});

