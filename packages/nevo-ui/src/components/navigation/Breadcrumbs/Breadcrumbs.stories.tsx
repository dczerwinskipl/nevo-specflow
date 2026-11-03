import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconButton } from '../../actions/IconButton';
import { BreadcrumbItem, Breadcrumbs } from './Breadcrumbs';

const meta = {
  title: 'Nevo UI/Navigation/Breadcrumbs',
  component: Breadcrumbs,
  tags: ['autodocs'],
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: <BreadcrumbItem>Customers</BreadcrumbItem> },
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem href="#customers">Customers</BreadcrumbItem>
      <BreadcrumbItem>Acme Industries</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

export const LongCurrentPage: Story = {
  args: { children: <BreadcrumbItem>Customers</BreadcrumbItem> },
  render: () => (
    <div className="max-w-sm">
      <Breadcrumbs>
        <BreadcrumbItem href="#customers">Customers</BreadcrumbItem>
        <BreadcrumbItem href="#enterprise">Enterprise</BreadcrumbItem>
        <BreadcrumbItem>Quarterly customer retention planning and ownership</BreadcrumbItem>
      </Breadcrumbs>
    </div>
  ),
};

/**
 * In-app trail on one fixed-height line (`overflow="collapse"`): ancestors are `onPress` buttons,
 * the current page truncates (full text in its title), and a leading one-level Back sits in the
 * same row — the split Secondary breadcrumb row's composition.
 */
export const InAppCollapsedTrail: Story = {
  args: { children: <BreadcrumbItem>Customers</BreadcrumbItem> },
  render: () => (
    <div className="grid gap-4">
      {[640, 330].map((width) => (
        <div key={width} style={{ width }} className="border border-border-subtle">
          <Breadcrumbs
            className="h-breadcrumb-row px-3"
            collapsedLabel="Show hidden levels"
            leading={
              <IconButton
                aria-label="Back to Changes"
                className="[&_svg]:rotate-180"
                icon="arrow-right"
                size="xs"
                variant="ghost"
              />
            }
            overflow="collapse"
          >
            <BreadcrumbItem onPress={() => undefined}>Tasks</BreadcrumbItem>
            <BreadcrumbItem onPress={() => undefined}>TASK-03</BreadcrumbItem>
            <BreadcrumbItem onPress={() => undefined}>Changes</BreadcrumbItem>
            <BreadcrumbItem>Review of the admission guard and its very long title</BreadcrumbItem>
          </Breadcrumbs>
        </div>
      ))}
    </div>
  ),
};
