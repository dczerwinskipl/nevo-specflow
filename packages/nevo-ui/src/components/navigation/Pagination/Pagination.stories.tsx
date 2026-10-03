import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Pagination } from './Pagination';

function PaginationPreview() {
  return (
    <Pagination
      mode="known"
      pageIndex={2}
      pageSize={50}
      totalCount={1245}
      onPageChange={() => {}}
    />
  );
}

const meta = {
  title: 'Nevo UI/Navigation/Pagination',
  component: PaginationPreview,
  tags: ['autodocs'],
} satisfies Meta<typeof PaginationPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

function NumberedPagesExample() {
  const [page, setPage] = useState(2);
  return (
    <Pagination
      mode="known"
      variant="pages"
      pageIndex={page}
      pageSize={50}
      totalCount={1245}
      onPageChange={setPage}
      pageSizeOptions={[25, 50, 100]}
      onPageSizeChange={() => {}}
    />
  );
}

function SimpleKnownTotalExample() {
  const [page, setPage] = useState(2);
  return (
    <Pagination
      mode="known"
      variant="simple"
      pageIndex={page}
      pageSize={50}
      totalCount={1245}
      onPageChange={setPage}
    />
  );
}

export const NumberedPages: Story = { render: () => <NumberedPagesExample /> };
export const SimpleKnownTotal: Story = { render: () => <SimpleKnownTotalExample /> };

export const UnknownTotal: Story = {
  render: () => (
    <Pagination
      mode="unknown"
      pageIndex={3}
      pageSize={50}
      hasNextPage
      onPageChange={() => {}}
      summary="Showing page 4"
    />
  ),
};

export const Cursor: Story = {
  render: () => (
    <Pagination
      mode="cursor"
      hasPreviousPage
      hasNextPage
      onPrevious={() => {}}
      onNext={() => {}}
      summary="Showing 50 records"
    />
  ),
};

export const Localized: Story = {
  render: () => (
    <Pagination
      mode="known"
      pageIndex={1}
      pageSize={25}
      totalCount={80}
      onPageChange={() => {}}
      pageSizeOptions={[25, 50]}
      onPageSizeChange={() => {}}
      labels={{
        navigation: 'Stronicowanie',
        rows: 'Wiersze',
        rowsPerPage: 'Wierszy na stronę',
        previous: 'Poprzednia',
        next: 'Następna',
        page: (page) => `Strona ${page}`,
        knownSummary: (start, end, total) => `${start}–${end} z ${total}`,
      }}
    />
  ),
};
