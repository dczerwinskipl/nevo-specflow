// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAnnouncer } from '../../../../shared/a11y/useAnnouncer';
import { useCreateGuide } from './useCreateGuide';

function Harness({ focusField }: { focusField: (field: string) => void }) {
  const { announce, region } = useAnnouncer();
  const { guide } = useCreateGuide({
    problemField: 'name',
    reason: 'Enter a specification name.',
    announce,
    focusField,
  });

  return (
    <>
      <button type="button" onClick={guide}>
        Create
      </button>
      {region}
    </>
  );
}

afterEach(cleanup);

describe('useCreateGuide', () => {
  it('announces the same reason again on every activation and leads to the field each time', async () => {
    const focusField = vi.fn();
    render(<Harness focusField={focusField} />);
    const region = screen.getByRole('status');
    const texts: string[] = [];
    const observer = new MutationObserver(() => texts.push(region.textContent ?? ''));
    observer.observe(region, { childList: true, characterData: true, subtree: true });

    for (let activation = 0; activation < 2; activation++) {
      await act(async () => {
        screen.getByRole('button').click();
        await Promise.resolve();
      });
    }

    observer.disconnect();
    // Cleared, then filled, twice: a screen reader hears the second activation too.
    expect(texts.filter((text) => text === 'Enter a specification name.')).toHaveLength(2);
    expect(texts.filter((text) => text === '').length).toBeGreaterThanOrEqual(1);
    expect(region.textContent).toBe('Enter a specification name.');
    expect(focusField).toHaveBeenCalledTimes(2);
    expect(focusField).toHaveBeenLastCalledWith('name');
  });
});
