import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { LoadingPresentation } from './LoadingPresentation';

const meta = {
  title: 'SpecFlow/Components/Loading Presentation',
  component: LoadingPresentation,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <StoryLocalization locale="en">
        <div className="mx-auto w-full max-w-content-standard p-4">
          <Story />
        </div>
      </StoryLocalization>
    ),
  ],
  args: { shape: 'specification', label: 'Loading specification' },
} satisfies Meta<typeof LoadingPresentation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  argTypes: {
    shape: {
      control: 'select',
      options: [
        'specification',
        'task',
        'preview',
        'overview',
        'list',
        'summary',
        'document',
        'history',
        'detail',
        'catalogue',
      ],
    },
    fetching: { control: 'boolean' },
    label: { control: 'text' },
  },
};
export const Specification: Story = { tags: ['contract'] };
export const FullTask: Story = { tags: ['contract'], args: { shape: 'task' } };
export const Preview: Story = { tags: ['contract'], args: { shape: 'preview' } };
export const Overview: Story = { tags: ['contract'], args: { shape: 'overview' } };
export const Aggregate: Story = { tags: ['contract'], args: { shape: 'list' } };
export const Summary: Story = { tags: ['contract'], args: { shape: 'summary' } };
export const Document: Story = { tags: ['contract'], args: { shape: 'document' } };
export const History: Story = { tags: ['contract'], args: { shape: 'history' } };
export const Detail: Story = { tags: ['contract'], args: { shape: 'detail' } };
export const Catalogue: Story = { tags: ['contract'], args: { shape: 'catalogue' } };
export const Paused: Story = { tags: ['contract'], args: { fetching: false } };

export const AccessibleMotion: Story = {
  tags: ['contract'],
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
    await expect(canvas.getByRole('status').closest('[aria-busy="true"]')).toBeNull();
    const skeleton = canvasElement.querySelector<HTMLElement>('.animate-pulse')!;
    await expect(getComputedStyle(skeleton).animationName).toBe(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'pulse',
    );
    await expect(skeleton.getBoundingClientRect().width).toBeGreaterThan(0);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
export const StaticPaused: Story = {
  args: { fetching: false },
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    for (const skeleton of canvasElement.querySelectorAll('.animate-pulse')) {
      await expect(getComputedStyle(skeleton).animationName).toBe('none');
    }
  },
};
