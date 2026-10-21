import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COMBOBOX_MIN_OPTIONS, OptionSelect } from './OptionSelect';

const items = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    value: `v${index}`,
    textValue: `Opcja ${index}`,
    label: `Opcja ${index}`,
  }));
const render = (count: number) =>
  renderToStaticMarkup(
    <OptionSelect items={items(count)} value="" onValueChange={() => undefined} />,
  );

describe('OptionSelect', () => {
  it('keeps a Select up to eight options', () => {
    expect(COMBOBOX_MIN_OPTIONS).toBe(9);
    expect(render(8)).not.toContain('<input');
  });
  it('switches to a searchable Combobox above eight options', () => {
    expect(render(9)).toContain('<input');
  });
});
