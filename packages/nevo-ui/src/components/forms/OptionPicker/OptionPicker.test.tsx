import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OPTION_PICKER_SELECT_MAX, OptionPicker } from './OptionPicker';

const labels = { showOptions: 'Show options', noResults: 'No results', loading: 'Loading' };
const items = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    value: `v${index}`,
    textValue: `Option ${index}`,
    label: `Option ${index}`,
  }));
const render = (count: number) =>
  renderToStaticMarkup(
    <OptionPicker items={items(count)} value="" labels={labels} onValueChange={() => undefined} />,
  );

describe('OptionPicker', () => {
  it('keeps a closed Select up to eight options', () => {
    expect(OPTION_PICKER_SELECT_MAX).toBe(8);
    expect(render(8)).not.toContain('<input');
  });

  it('switches to a searchable Combobox above eight options and names its button from the labels', () => {
    const markup = render(9);
    expect(markup).toContain('<input');
    expect(markup).toContain('aria-label="Show options"');
  });
});

it('renders the closed selected label in truncating mode while both option lists use wrapping mode', () => {
  for (const count of [2, 9]) {
    const label = vi.fn((wraps: boolean) => (
      <span data-wraps={String(wraps)}>A long option name</span>
    ));
    const values = items(count).map((item) => ({ ...item, label }));
    const markup = renderToStaticMarkup(
      <OptionPicker items={values} value="v0" labels={labels} onValueChange={() => undefined} />,
    );
    expect(label.mock.calls.filter(([wraps]) => wraps)).toHaveLength(count);
    if (count === 2) {
      expect(markup).toContain('data-wraps="false"');
    }
  }
});
