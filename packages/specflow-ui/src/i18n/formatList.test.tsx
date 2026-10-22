// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { message, translateMessage } from './message';
import { createSpecFlowI18n } from './i18n';
import { LocalizationProvider } from './LocalizationProvider';
import { FormattedList, formatList } from './formatList';

afterEach(cleanup);

describe('formatList', () => {
  it('uses the conjunction and separators of the locale', () => {
    expect(formatList(['base', 'target', 'name'], 'en')).toBe('base, target, and name');
    expect(formatList(['baza', 'cel', 'nazwa'], 'pl')).toBe('baza, cel i nazwa');
    expect(formatList(['one'], 'en')).toBe('one');
  });
});

describe('FormattedList', () => {
  it.each([
    ['en' as const, 'A and B'],
    ['pl' as const, 'A i B'],
  ])('keeps the markup of each item and the %s conjunction between them', (locale, text) => {
    const { container } = render(
      <LocalizationProvider instance={createSpecFlowI18n(locale)}>
        <FormattedList items={[<b key="a">A</b>, <b key="b">B</b>]} />
      </LocalizationProvider>,
    );
    expect(container.textContent).toBe(text);
    expect(container.querySelectorAll('b')).toHaveLength(2);
  });
});

describe('translateMessage lists', () => {
  it('joins a list value by the language of the message', () => {
    const pl = createSpecFlowI18n('pl');
    const text = translateMessage(
      pl.t,
      message('create.workspace.settings.changed', {
        count: 2,
        names: [
          message('create.workspace.settings.nameBase'),
          message('create.workspace.settings.nameTarget'),
        ],
      }),
      'pl',
    );
    expect(text).toMatch(/ i /);
    expect(text).not.toMatch(/, [^,]*$/);
  });
});
