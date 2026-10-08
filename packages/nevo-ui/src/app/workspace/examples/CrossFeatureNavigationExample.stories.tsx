import type { Meta, StoryObj } from '@storybook/react-vite';
import { CrossFeatureNavigationExample } from './CrossFeatureNavigationExample';

const meta = {
  title: 'Nevo UI/Workspace/Cross-feature Secondary drilldown',
  component: CrossFeatureNavigationExample,
  tags: ['contract'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CrossFeatureNavigationExample>;
export default meta;
type Story = StoryObj<typeof meta>;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

export const TaskChangesFileAndScope: Story = {
  args: { width: 1400 },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open Task' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Review task changes' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Inspect changed file' }));
    const value = canvasElement.querySelector('[data-cross-feature-updated]')?.textContent;
    const mountId = canvasElement.querySelector('[data-cross-feature-mount]')?.textContent;
    assert(value && mountId, 'File page must be mounted with live data');
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh three sources' }));
    assert(
      canvasElement.querySelector('[data-cross-feature-updated]')?.textContent !== value,
      'File receives fresh props',
    );
    assert(
      canvasElement.querySelector('[data-cross-feature-mount]')?.textContent === mountId,
      'Refresh must not remount',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
    assert(canvas.getByText(/Changes: Changed files/), 'Back must return to Changes module');
    await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
    assert(canvas.getByText(/Task: Implement navigation/), 'Back must return to Task module');
    await userEvent.click(canvas.getByRole('button', { name: /Switch project scope/ }));
    assert(canvas.getByText('Default activity panel'), 'Switching scope clears runtime Secondary');
    assert(
      canvasElement.querySelectorAll('[data-cross-feature-mount]').length === 0,
      'Old scope must not remain mounted',
    );
  },
};
