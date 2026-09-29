import { Fragment } from 'react';
import { describe, expect, it } from 'vitest';
import {
  collectEnabledItemValues,
  resolveRovingIndex,
  resolveRovingTabStop,
} from './rovingSelection';

describe('rovingSelection', () => {
  it('derives the tab stop from enabled child values, including fragments', () => {
    const values = collectEnabledItemValues(
      <>
        <button value="first">First</button>
        <Fragment>
          <button disabled value="disabled">
            Disabled
          </button>
          <button value="last">Last</button>
        </Fragment>
      </>,
    );

    expect(values).toEqual(['first', 'last']);
    expect(resolveRovingTabStop('last', values)).toBe('last');
    expect(resolveRovingTabStop('missing', values)).toBe('first');
  });

  it('resolves wrapping and boundary keyboard movement', () => {
    expect(resolveRovingIndex('ArrowRight', 1, 2)).toBe(0);
    expect(resolveRovingIndex('ArrowLeft', 0, 2)).toBe(1);
    expect(resolveRovingIndex('Home', 1, 2)).toBe(0);
    expect(resolveRovingIndex('End', 0, 2)).toBe(1);
    expect(resolveRovingIndex('ArrowDown', 0, 2, true)).toBe(1);
    expect(resolveRovingIndex('ArrowUp', 0, 2, true)).toBe(1);
    expect(resolveRovingIndex('ArrowDown', 0, 2)).toBeNull();
  });
});

