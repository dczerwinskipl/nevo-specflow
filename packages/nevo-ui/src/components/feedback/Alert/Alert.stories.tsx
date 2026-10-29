import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StatusTone } from '../../../design-system/statusTone';
import { Alert } from './Alert';

const meta = {
  title: 'Nevo UI/Feedback/Alert',
  component: Alert,
  tags: ['autodocs'],
  args: {
    title: 'Import completed',
    children: '42 records were processed successfully.',
    tone: 'success',
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  render: (args) => (
    <div className="grid max-w-xl gap-3">
      {(
        [
          'neutral',
          'info',
          'success',
          'attention',
          'danger',
        ] as const satisfies readonly StatusTone[]
      ).map((tone) => (
        <Alert {...args} key={tone} tone={tone} title={`${tone} alert`} />
      ))}
    </div>
  ),
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const twoActions = (
  <>
    <button type="button" className="rounded-control border px-2 py-1 text-label-sm">
      Copy my version
    </button>
    <button type="button" className="rounded-control border px-2 py-1 text-label-sm">
      Load the version on disk…
    </button>
  </>
);

/**
 * Actions on a narrow Alert move below the text (the title and body keep the width); on a wide
 * one they sit beside it. Several actions keep the standard gap.
 */
export const ActionsOnNarrowAndWide: Story = {
  args: {
    tone: 'attention',
    title: 'Not saved: ux.md changed on disk',
    children: 'The file was changed outside this editor after you opened it.',
    actions: twoActions,
  },
  render: (args) => (
    <div className="grid gap-4">
      <div data-width="narrow" style={{ width: 340 }}>
        <Alert {...args} />
      </div>
      <div data-width="medium" style={{ width: 567 }}>
        <Alert {...args} />
      </div>
      <div data-width="wide" style={{ width: 900 }}>
        <Alert {...args} />
      </div>
    </div>
  ),
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    for (const width of ['narrow', 'medium', 'wide'] as const) {
      const frame = canvasElement.querySelector<HTMLElement>(`[data-width="${width}"]`)!;
      const title = frame.querySelector<HTMLElement>('[data-design-slot="title"]')!;
      const actions = frame.querySelector<HTMLElement>('[data-design-slot="actions"]')!;
      const [first, second] = Array.from(actions.querySelectorAll('button'));
      assert(first && second, 'Both actions render.');
      const gap = second.getBoundingClientRect().left - first.getBoundingClientRect().right;
      const wrapped = second.getBoundingClientRect().top > first.getBoundingClientRect().top;
      assert(wrapped || gap >= 8, `The ${width} actions keep a gap.`);
      if (width !== 'wide') {
        assert(
          actions.getBoundingClientRect().top >= title.getBoundingClientRect().bottom,
          'On a narrow Alert the actions sit below the text.',
        );
        assert(title.getBoundingClientRect().width > 200, 'The title keeps the width.');
      } else {
        assert(
          actions.getBoundingClientRect().left > title.getBoundingClientRect().right,
          'On a wide Alert the actions sit beside the text.',
        );
      }
    }
  },
};

export const AssertiveAnnouncement: Story = {
  args: {
    role: 'alert',
    tone: 'danger',
    title: 'Import failed',
    children: 'The import stopped before any records were changed.',
  },
};
