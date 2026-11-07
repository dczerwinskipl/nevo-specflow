// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { firstChoiceControl } from './createGuide';

const group = (html: string) => {
  const container = document.createElement('div');
  container.innerHTML = html;

  return container;
};

describe('firstChoiceControl', () => {
  it('leads to the chosen option', () => {
    const container = group(
      '<input type="radio" name="a" value="1"><input type="radio" name="a" value="2" checked>',
    );
    expect(firstChoiceControl(container)?.getAttribute('value')).toBe('2');
  });

  it('skips a chosen option that is disabled and leads to the first one that can be chosen', () => {
    const container = group(
      '<input type="radio" name="a" value="1" disabled>' +
        '<input type="radio" name="a" value="2" checked disabled>' +
        '<input type="radio" name="a" value="3" aria-disabled="true">' +
        '<input type="radio" name="a" value="4">',
    );
    expect(firstChoiceControl(container)?.getAttribute('value')).toBe('4');
  });

  it('works with ARIA radios as well', () => {
    const container = group(
      '<button role="radio" aria-checked="true" disabled>a</button>' +
        '<button role="radio" aria-checked="false">b</button>',
    );
    expect(firstChoiceControl(container)?.textContent).toBe('b');
  });

  it('finds nothing without a group', () => {
    expect(firstChoiceControl(null)).toBeNull();
  });
});
