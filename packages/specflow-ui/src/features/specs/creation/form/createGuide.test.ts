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

describe('firstChoiceControl never returns a checked option that is ARIA-disabled', () => {
  it('a checked native radio with aria-disabled falls through to the first usable option', () => {
    const container = group(
      '<input type="radio" name="a" value="1" checked aria-disabled="true">' +
        '<input type="radio" name="a" value="2">',
    );
    expect(firstChoiceControl(container)?.getAttribute('value')).toBe('2');
  });

  it('a checked ARIA radio with aria-disabled falls through, or to nothing when none is usable', () => {
    const usable = group(
      '<button role="radio" aria-checked="true" aria-disabled="true">a</button>' +
        '<button role="radio" aria-checked="false">b</button>',
    );
    expect(firstChoiceControl(usable)?.textContent).toBe('b');
    const none = group(
      '<button role="radio" aria-checked="true" aria-disabled="true">a</button>' +
        '<button role="radio" aria-checked="false" aria-disabled="true">b</button>',
    );
    expect(firstChoiceControl(none)).toBeNull();
  });
});
