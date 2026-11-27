import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../actions/Button';
import { Checkbox } from '../../forms/Checkbox';
import { Typography } from '../../foundations/Typography';
import { InformationList } from './InformationList';

const meta = {
  title: 'Nevo UI/Content/InformationList',
  tags: ['contract', '!autodocs'],
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export const InteractionContract: Story = {
  render: () => (
    <div className="w-[36rem] p-4">
      <InformationList selectable>
        <InformationList.Item interactive data-testid="row-1">
          <InformationList.Leading>
            <Checkbox aria-label="Select item 1" />
          </InformationList.Leading>
          <InformationList.Content>
            <Typography variant="title-sm">
              <a
                href="#item-1"
                data-testid="link-1"
                onClick={(e) => {
                  e.preventDefault();
                }}
              >
                Item 1 Title
              </a>
            </Typography>
            <Typography variant="body-sm">Supporting fact</Typography>
          </InformationList.Content>
          <InformationList.Trailing>
            <Button size="sm" variant="secondary" data-testid="action-1">
              Action
            </Button>
          </InformationList.Trailing>
        </InformationList.Item>
      </InformationList>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const checkbox = canvas.getByRole('checkbox', { name: 'Select item 1' });
    const link = canvas.getByTestId('link-1');
    const button = canvas.getByTestId('action-1');

    assert(checkbox, 'Checkbox must be present in selectable row.');
    assert(link, 'Primary title link must be present.');
    assert(button, 'Trailing action button must be present.');

    // Nested controls must remain independently operable
    await userEvent.click(checkbox);
    assert(
      checkbox.getAttribute('data-state') === 'checked',
      'Checkbox should toggle when clicked.',
    );

    await userEvent.click(button);
    // Button is clicked without error
  },
};

/**
 * `align="first-line"`: a decorative mark on the first text line at any row height (here a wrapping
 * three-line row), never centred on the row; the default `top` box is a control-height box at the
 * row top.
 */
export const LeadingFirstLine: Story = {
  render: () => (
    <div className="w-72">
      <InformationList>
        {(['first-line', 'top'] as const).map((align) => (
          <InformationList.Item key={align} data-testid={`row-${align}`}>
            <InformationList.Leading align={align}>
              <span
                aria-hidden="true"
                data-testid={`mark-${align}`}
                className="size-4 bg-current"
              />
            </InformationList.Leading>
            <InformationList.Content data-testid={`content-${align}`}>
              <Typography variant="title-sm">
                A long title that wraps over several lines in a narrow row, so the row is much
                taller than its leading box
              </Typography>
              <Typography variant="body-sm">Supporting fact</Typography>
            </InformationList.Content>
          </InformationList.Item>
        ))}
      </InformationList>
    </div>
  ),
  play: async ({ canvas }) => {
    const centre = (box: DOMRect) => box.top + box.height / 2;
    const mark = canvas.getByTestId('mark-first-line').getBoundingClientRect();
    const content = canvas.getByTestId('content-first-line').getBoundingClientRect();
    assert(content.height > 70, 'The row must span several lines for the check to mean anything');
    // The first text line is 20 px high: the mark sits on its centre, at the row top.
    assert(
      Math.abs(centre(mark) - (content.top + 10)) <= 1.5,
      'A first-line mark sits on the first text line',
    );
    const topMark = canvas.getByTestId('mark-top').getBoundingClientRect();
    const topContent = canvas.getByTestId('content-top').getBoundingClientRect();
    assert(
      centre(topMark) < centre(topContent) - 10,
      'The default leading box stays anchored at the row top',
    );
  },
};

/** `align="center"`: a decorative mark centred on a short row (a title and one line of facts). */
export const LeadingCenter: Story = {
  render: () => (
    <div className="w-72">
      <InformationList>
        <InformationList.Item>
          <InformationList.Leading align="center">
            <span aria-hidden="true" data-testid="mark-center" className="size-4 bg-current" />
          </InformationList.Leading>
          <InformationList.Content data-testid="content-center">
            <Typography variant="title-sm">Review the breakdown</Typography>
            <Typography variant="body-sm">Attempt 2 · Opus 5.5 · 17 hours ago</Typography>
          </InformationList.Content>
        </InformationList.Item>
      </InformationList>
    </div>
  ),
  play: async ({ canvas }) => {
    const centre = (box: DOMRect) => box.top + box.height / 2;
    const mark = canvas.getByTestId('mark-center').getBoundingClientRect();
    const content = canvas.getByTestId('content-center').getBoundingClientRect();
    assert(content.height > 30, 'The row must span two lines for the check to mean anything');
    assert(
      Math.abs(centre(mark) - centre(content)) <= 1.5,
      'A centred mark sits on the row centre',
    );
  },
};

export const CompactTextRows: Story = {
  render: () => (
    <div className="w-72">
      <InformationList>
        <InformationList.Item interactive data-testid="plain-row">
          <InformationList.Content>
            <Typography variant="title-sm">
              <button type="button">Short requirement</button>
            </Typography>
          </InformationList.Content>
        </InformationList.Item>
      </InformationList>
      <InformationList selectable>
        <InformationList.Item data-testid="control-row">
          <InformationList.Leading>
            <Checkbox aria-label="Select compact item" />
          </InformationList.Leading>
          <InformationList.Content>Selectable item</InformationList.Content>
        </InformationList.Item>
      </InformationList>
    </div>
  ),
  play: async ({ canvas }) => {
    const plain = canvas.getByTestId('plain-row').getBoundingClientRect();
    const controlled = canvas.getByTestId('control-row').getBoundingClientRect();
    const title = canvas.getByRole('button', { name: 'Short requirement' }).getBoundingClientRect();
    assert(
      plain.height >= 36 && plain.height <= 40,
      'A simple row keeps a compact, accessible activation area',
    );
    assert(controlled.height >= 52, 'A real control retains its own height and padding');
    assert(title.left - plain.left <= 9, 'Text-only rows must not reserve an empty leading rail');
  },
};
