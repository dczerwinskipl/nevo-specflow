// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { firstChoiceControl, modelDecidedTarget } from './createGuide';

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

describe('modelDecidedTarget', () => {
  const model = document.createElement('button');

  it('leads to the chosen mode of a segmented group', () => {
    const modes = group(
      '<div role="radiogroup"><button role="radio" aria-checked="false">Ask</button>' +
        '<button role="radio" aria-checked="true">Agent</button></div>',
    ).firstElementChild as HTMLElement;
    expect(modelDecidedTarget(modes, model)?.textContent).toBe('Agent');
  });

  it('leads to the model picker when the model decides the modes (every item disabled)', () => {
    const modes = group(
      '<div role="radiogroup"><button role="radio" aria-checked="true" disabled>Ask</button>' +
        '<button role="radio" aria-checked="false" disabled>Agent</button></div>',
    ).firstElementChild as HTMLElement;
    expect(modelDecidedTarget(modes, model)).toBe(model);
  });

  it('leads to an enabled mode picker, and past a disabled one to the model picker', () => {
    const picker = document.createElement('button');
    expect(modelDecidedTarget(picker, model)).toBe(picker);
    picker.disabled = true;
    expect(modelDecidedTarget(picker, model)).toBe(model);
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

describe('modelDecidedTarget for the Effort picker', () => {
  it('leads to an enabled Effort picker, and to the model picker while the model decides it', () => {
    const model = document.createElement('button');
    const effort = document.createElement('button');
    expect(modelDecidedTarget(effort, model)).toBe(effort);
    effort.setAttribute('aria-disabled', 'true');
    expect(modelDecidedTarget(effort, model)).toBe(model);
  });
});
