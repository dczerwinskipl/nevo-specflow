import type { Meta, StoryObj } from '@storybook/react-vite';
import { SegmentedControl } from './SegmentedControl';

const meta = {
  title: 'Nevo UI/Forms/SegmentedControl',
  tags: ['contract', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'centered' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const KeyboardNavigationContract: Story = {
  render: () => (
    <SegmentedControl aria-label="View mode" className="w-96" defaultValue="preview">
      <SegmentedControl.Item value="preview">Preview</SegmentedControl.Item>
      <SegmentedControl.Item disabled value="unavailable">
        Unavailable
      </SegmentedControl.Item>
      <SegmentedControl.Item value="code">Code</SegmentedControl.Item>
    </SegmentedControl>
  ),
  play: async ({ canvas, userEvent }) => {
    const items = canvas.getAllByRole('radio');
    const [preview, unavailable, code] = items;
    assert(preview && unavailable && code, 'The fixture should render all segmented items.');

    assert(preview.tabIndex === 0, 'The selected enabled item should be tabbable.');
    assert(
      unavailable.tabIndex === -1,
      'Unavailable items should not participate in roving focus.',
    );

    preview.focus();
    await userEvent.keyboard('{ArrowRight}');
    assert(document.activeElement === code, 'ArrowRight should skip unavailable items.');
    assert(
      code.getAttribute('aria-checked') === 'true',
      'ArrowRight should select the focused item.',
    );

    await userEvent.keyboard('{ArrowDown}');
    assert(document.activeElement === preview, 'ArrowDown should wrap to the next enabled item.');
    await userEvent.keyboard('{End}');
    assert(document.activeElement === code, 'End should focus the last enabled item.');
    await userEvent.keyboard('{Home}');
    assert(document.activeElement === preview, 'Home should focus the first enabled item.');
    await userEvent.keyboard('{ArrowUp}');
    assert(document.activeElement === code, 'ArrowUp should wrap to the previous enabled item.');
  },
};
