import type { Meta, StoryObj } from '@storybook/react-vite';
import { DescriptionList } from './DescriptionList';

const meta = {
  title: 'Nevo UI/Content/DescriptionList',
  component: DescriptionList,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Terms and their details for the facts of one thing. Aligned (shared term column) or inline (one wrapping line per pair).',
      },
    },
  },
} satisfies Meta<typeof DescriptionList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Aligned: Story = {
  render: () => (
    <div className="w-[28rem] max-w-full">
      <DescriptionList aria-label="Workspace facts">
        <DescriptionList.Item>
          <DescriptionList.Term>Start from</DescriptionList.Term>
          <DescriptionList.Detail emphasis="secondary">main</DescriptionList.Detail>
        </DescriptionList.Item>
        <DescriptionList.Item>
          <DescriptionList.Term>Merge into</DescriptionList.Term>
          <DescriptionList.Detail note="Not available: the current checkout is on another branch.">
            Not available
          </DescriptionList.Detail>
        </DescriptionList.Item>
        <DescriptionList.Item>
          <DescriptionList.Term>Folder</DescriptionList.Term>
          <DescriptionList.Detail>
            C:/Users/example/work/worktrees/a-very-long-folder-name-that-has-to-wrap
          </DescriptionList.Detail>
        </DescriptionList.Item>
      </DescriptionList>
    </div>
  ),
};

export const Inline: Story = {
  render: () => (
    <div className="w-[20rem] max-w-full">
      <DescriptionList layout="inline" aria-label="Operation">
        <DescriptionList.Item>
          <DescriptionList.Term>Operation</DescriptionList.Term>
          <DescriptionList.Detail>7f3a91c2-4b6e-4d1a-9c0e-2f5a1b8d3e77</DescriptionList.Detail>
        </DescriptionList.Item>
        <DescriptionList.Item>
          <DescriptionList.Term>Specification</DescriptionList.Term>
          <DescriptionList.Detail>Payment limits</DescriptionList.Detail>
        </DescriptionList.Item>
      </DescriptionList>
    </div>
  ),
};

export const NarrowViewport: Story = {
  render: () => (
    <div className="w-[17.5rem]">
      <DescriptionList aria-label="Properties">
        <DescriptionList.Item>
          <DescriptionList.Term>status</DescriptionList.Term>
          <DescriptionList.Detail>active</DescriptionList.Detail>
        </DescriptionList.Item>
        <DescriptionList.Item>
          <DescriptionList.Term>a-very-long-property-name-without-spaces</DescriptionList.Term>
          <DescriptionList.Detail>a value that is also long enough to wrap</DescriptionList.Detail>
        </DescriptionList.Item>
      </DescriptionList>
    </div>
  ),
};
