import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { BreadcrumbItem, Breadcrumbs } from './Breadcrumbs';
import { Pagination } from './Pagination';

const meta = {
  title: 'Nevo UI/Navigation/Design Capture',
  tags: ['!dev', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const BreadcrumbsCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Breadcrumbs']}>
      <div className="p-8">
        <Breadcrumbs
          className="inline-flex"
          data-design-canonical="true"
          data-design-source-id="default"
        >
          <BreadcrumbItem href="#customers">Customers</BreadcrumbItem>
          <BreadcrumbItem href="#enterprise">Enterprise</BreadcrumbItem>
          <BreadcrumbItem>Acme Industries</BreadcrumbItem>
        </Breadcrumbs>
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'Breadcrumbs',
      title: 'Breadcrumbs',
      description: 'Hierarchical location trail',
      kind: 'component',
      order: 128,
    },
  },
};

export const PaginationCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['Pagination']}>
      <div className="grid w-[48rem] gap-6 p-8">
        <Pagination
          data-design-canonical="true"
          data-design-source-id="known-pages"
          labels={{ navigation: 'Known pages pagination' }}
          mode="known"
          onPageChange={() => {}}
          pageIndex={2}
          pageSize={50}
          totalCount={1245}
        />
        <Pagination
          data-design-canonical="true"
          data-design-source-id="known-simple"
          labels={{ navigation: 'Known simple pagination' }}
          mode="known"
          onPageChange={() => {}}
          pageIndex={2}
          pageSize={50}
          totalCount={1245}
          variant="simple"
        />
        <Pagination
          data-design-canonical="true"
          data-design-source-id="unknown-simple"
          hasNextPage
          labels={{ navigation: 'Unknown total pagination' }}
          mode="unknown"
          onPageChange={() => {}}
          pageIndex={3}
          pageSize={50}
          summary="Showing page 4"
        />
        <Pagination
          data-design-canonical="true"
          data-design-source-id="cursor-simple"
          hasNextPage
          hasPreviousPage
          labels={{ navigation: 'Cursor pagination' }}
          mode="cursor"
          onNext={() => {}}
          onPrevious={() => {}}
          summary="Showing 50 records"
        />
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'Pagination',
      title: 'Pagination',
      description: 'Valid pagination presentations',
      kind: 'component',
      order: 130,
    },
  },
};



