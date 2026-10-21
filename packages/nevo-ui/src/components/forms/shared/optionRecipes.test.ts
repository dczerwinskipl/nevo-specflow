import { describe, expect, it } from 'vitest';
import { selectItemClassName } from '../Select/Select';
import { optionItemClassName } from './optionRecipes';

describe('option recipes', () => {
  it('are the single source of the Select and Combobox option classes', () => {
    for (const keepsReasonReadable of [false, true]) {
      for (const unavailable of [false, true]) {
        expect(selectItemClassName({ keepsReasonReadable, unavailable })).toBe(
          optionItemClassName({ keepsReasonReadable, unavailable }),
        );
      }
    }
  });

  it('keeps a readable reason unfaded and fades plain disabled options', () => {
    expect(optionItemClassName({ keepsReasonReadable: false, unavailable: false })).toContain(
      'data-[disabled]:opacity-50',
    );
    expect(optionItemClassName({ keepsReasonReadable: true, unavailable: true })).not.toContain(
      'data-[disabled]:opacity-50',
    );
  });
});
