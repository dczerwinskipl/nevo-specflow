import type { Meta, StoryObj } from '@storybook/react-vite';
import { BreadcrumbItem, Breadcrumbs } from './Breadcrumbs';

const meta = {
  title: 'Nevo UI/Navigation/Breadcrumbs',
  component: Breadcrumbs,
  tags: ['autodocs'],
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'Customers' },
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem href="#customers">Customers</BreadcrumbItem>
      <BreadcrumbItem>Acme Industries</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

export const LongCurrentPage: Story = {
  args: { children: 'Customers' },
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
