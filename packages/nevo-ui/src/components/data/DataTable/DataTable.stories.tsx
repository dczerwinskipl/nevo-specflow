import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '../../actions/Button';
import { Badge } from '../../feedback/Badge';
import { EmptyState } from '../../feedback/EmptyState';
import { TextInput } from '../../forms/TextInput';
import { WorkspaceSurfacePreview } from '../../foundations/Environment';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../overlays/Menu';
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowSelectionState,
  type DataTableSortingState,
} from './DataTable';

interface Customer {
  id: string;
  name: string;
  country: string;
  status: 'active' | 'pending' | 'blocked';
  revenue: number;
}

const customers: Customer[] = Array.from({ length: 18 }, (_, index) => ({
  id: `C-${1000 + index}`,
  name: ['Acme Industries', 'Northwind', 'Contoso', 'Globex'][index % 4] + ` ${index + 1}`,
  country: ['PL', 'DE', 'NL', 'US'][index % 4]!,
  status: (['active', 'pending', 'blocked'] as const)[index % 3]!,
  revenue: 12_000 + index * 2_750,
}));

const baseColumns: DataTableColumn<Customer>[] = [
  { id: 'id', header: 'Customer ID', accessor: 'id', width: 120, minWidth: 100 },
  { id: 'name', header: 'Customer', accessor: 'name', width: 260, minWidth: 160 },
  { id: 'country', header: 'Country', accessor: 'country', width: 110 },
  {
    id: 'status',
    header: 'Status',
    accessor: 'status',
    width: 130,
    cell: ({ value }) => (
      <Badge tone={value === 'active' ? 'success' : value === 'pending' ? 'attention' : 'danger'}>
        {String(value)}
      </Badge>
    ),
  },
  {
    id: 'revenue',
    header: 'Revenue',
    accessor: 'revenue',
    align: 'end',
    width: 150,
    cell: ({ value }) => `${Number(value).toLocaleString('en-US')} EUR`,
  },
];

const actionColumn: DataTableColumn<Customer> = {
  id: 'actions',
  header: '',
  label: 'Actions',
  width: 64,
  minWidth: 64,
  maxWidth: 64,
  hideable: false,
  resizable: false,
  sortable: false,
  align: 'end',
  cell: ({ row }) => (
    <Menu>
      <MenuTrigger asChild>
        <Button aria-label={`Actions for ${row.name}`} size="sm" variant="ghost">
          •••
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem>Edit</MenuItem>
        <MenuItem>Duplicate</MenuItem>
        <MenuSeparator />
        <MenuItem tone="danger">Delete</MenuItem>
      </MenuContent>
    </Menu>
  ),
};

interface ExampleProps {
  compact?: boolean;
  withRowActions?: boolean;
  initialSorting?: DataTableSortingState;
  initialSelection?: DataTableRowSelectionState;
  showColumnVisibility?: boolean;
}

function Example({
  compact = false,
  withRowActions = false,
  initialSorting = [],
  initialSelection = {},
  showColumnVisibility = true,
}: ExampleProps) {
  const [sorting, setSorting] = useState<DataTableSortingState>(initialSorting);
  const [rowSelection, setRowSelection] = useState<DataTableRowSelectionState>(initialSelection);
  const [query, setQuery] = useState('');
  const filtered = customers.filter((customer) =>
    customer.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="p-6">
      <DataTable
        columns={withRowActions ? [...baseColumns, actionColumn] : baseColumns}
        data={filtered}
        density={compact ? 'compact' : 'default'}
        enableRowSelection
        getRowId={(row) => row.id}
        hasActiveFilters={Boolean(query)}
        showColumnVisibility={showColumnVisibility}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        sorting={sorting}
        onSortingChange={setSorting}
        toolbar={
          <TextInput
            aria-label="Search customers"
            className="max-w-72"
            placeholder="Search customers"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        }
      />
    </div>
  );
}

function InteractiveRows() {
  const [rowClicks, setRowClicks] = useState(0);
  const [buttonClicks, setButtonClicks] = useState(0);
  const columns: DataTableColumn<Customer>[] = [
    ...baseColumns.slice(0, 2),
    {
      id: 'contact',
      header: 'Contact',
      label: 'Contact customer',
      width: 160,
      sortable: false,
      cell: () => (
        <Button size="sm" variant="ghost" onClick={() => setButtonClicks((count) => count + 1)}>
          Contact
        </Button>
      ),
    },
    actionColumn,
  ];

  return (
    <div className="grid gap-3 p-6">
      <p className="text-body-sm text-content-muted">
        Row actions: <span data-row-clicks>{rowClicks}</span> · Button actions:{' '}
        <span data-button-clicks>{buttonClicks}</span>
      </p>
      <DataTable
        columns={columns}
        data={customers.slice(0, 3)}
        getRowId={(row) => row.id}
        onRowClick={() => setRowClicks((count) => count + 1)}
      />
    </div>
  );
}

const longColumns: DataTableColumn<Customer>[] = [
  {
    id: 'customer-summary',
    header: 'Customer name and registered legal entity',
    accessor: (row) =>
      `${row.name} — International enterprise account with an intentionally long legal name`,
    width: 360,
    minWidth: 240,
  },
  ...baseColumns.slice(2),
];

const wideColumns: DataTableColumn<Customer>[] = [
  ...baseColumns,
  {
    id: 'region',
    header: 'Operating region',
    accessor: (row) => `Region ${row.country}`,
    width: 220,
  },
  { id: 'owner', header: 'Account owner', accessor: (row) => `Owner ${row.id}`, width: 260 },
  actionColumn,
];

const meta = {
  title: 'Nevo UI/Data/DataTable',
  component: Example,
  tags: ['autodocs'],
  args: {},
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, context) =>
      context.parameters.designCapture ? (
        <Story />
      ) : (
        <WorkspaceSurfacePreview>
          <Story />
        </WorkspaceSurfacePreview>
      ),
  ],
} satisfies Meta<typeof Example>;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitFor<T>(read: () => T | null | false, message: string): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = read();
    if (result) return result;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error(message);
}

export const Default: Story = {};
export const Compact: Story = { args: { compact: true } };
export const Sorting: Story = { args: { initialSorting: [{ id: 'name', desc: false }] } };
export const MultiSorting: Story = {
  args: {
    initialSorting: [
      { id: 'status', desc: false },
      { id: 'name', desc: false },
    ],
  },
};
export const Selection: Story = { args: { initialSelection: { 'C-1001': true, 'C-1002': true } } };
export const RowActions: Story = { args: { withRowActions: true } };
export const ColumnVisibility: Story = { args: { showColumnVisibility: true } };

export const Empty: Story = {
  render: () => (
    <div className="p-6">
      <DataTable columns={baseColumns} data={[]} />
    </div>
  ),
};

export const LocalizedEmpty: Story = {
  render: () => (
    <div className="p-6">
      <DataTable
        columns={baseColumns}
        data={[]}
        messages={{ emptyTitle: 'Brak danych', emptyDescription: 'Nie ma rekordów.' }}
      />
    </div>
  ),
};

export const EmptyCustomContent: Story = {
  render: () => (
    <div className="p-6">
      <DataTable
        columns={baseColumns}
        data={[]}
        emptyState={
          <EmptyState
            className="border-0 bg-transparent"
            title="No customers"
            description="Customer creation belongs outside the table, so this state intentionally has no action."
          />
        }
      />
    </div>
  ),
};

export const NoResults: Story = {
  render: () => (
    <div className="p-6">
      <DataTable columns={baseColumns} data={[]} hasActiveFilters />
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="p-6">
      <DataTable columns={baseColumns} data={[]} loading />
    </div>
  ),
};

export const ErrorState: Story = {
  render: () => (
    <div className="p-6">
      <DataTable columns={baseColumns} data={[]} errorState="Customer data could not be loaded." />
    </div>
  ),
};

export const Resizing: Story = {
  render: () => (
    <div className="p-6">
      <DataTable columns={baseColumns} data={customers.slice(0, 6)} />
    </div>
  ),
};

export const NarrowOverflow: Story = {
  render: () => (
    <div className="w-[32rem] p-6">
      <DataTable columns={wideColumns} data={customers.slice(0, 6)} />
    </div>
  ),
};

export const MobileWideTable: Story = {
  render: () => (
    <div className="w-[23rem] max-w-full bg-surface p-3">
      <DataTable columns={wideColumns} data={customers.slice(0, 6)} />
    </div>
  ),
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const LongContent: Story = {
  render: () => (
    <div className="max-w-4xl p-6">
      <DataTable columns={longColumns} data={customers.slice(0, 6)} />
    </div>
  ),
};

export const InteractiveContent: Story = { render: () => <InteractiveRows /> };

export const InteractionContract: Story = {
  render: () => <InteractiveRows />,
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, canvasElement, userEvent }) => {
    const firstRow = canvas.getByText('C-1000').closest('tr');
    assert(firstRow, 'The fixture should expose its first data row.');

    await userEvent.click(firstRow);
    assert(
      canvasElement.querySelector('[data-row-clicks]')?.textContent === '1',
      'Clicking passive row content should invoke the row action.',
    );
    firstRow.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    assert(
      canvasElement.querySelector('[data-row-clicks]')?.textContent === '3',
      'Enter and Space should invoke the focused row action.',
    );
    await userEvent.click(canvas.getAllByRole('button', { name: 'Contact' })[0]!);
    assert(
      canvasElement.querySelector('[data-row-clicks]')?.textContent === '3',
      'Clicking an interactive cell control must not invoke the row action.',
    );
    await waitFor(
      () => canvasElement.querySelector('[data-button-clicks]')?.textContent === '1',
      'The interactive cell control should retain its own behavior.',
    );

    const actions = canvas.getByRole('button', { name: 'Actions for Acme Industries 1' });
    actions.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(
      () => document.querySelector<HTMLElement>('[role="menu"]'),
      'The row action menu should open.',
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(
      () => document.querySelector('[role="menu"]') === null,
      'Escape should close the row action menu.',
    );
    assert(
      document.activeElement === actions,
      'Closing the row action menu should restore trigger focus.',
    );
  },
};

export const StateAndGeometryContract: Story = {
  render: () => <Example withRowActions />,
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Sort by Customer' }));
    assert(
      canvas
        .getByRole('button', { name: 'Sort by Customer' })
        .closest('th')
        ?.getAttribute('aria-sort') === 'ascending',
      'Sorting should update controlled state.',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Sort by Customer' }));
    assert(
      canvas
        .getByRole('button', { name: 'Sort by Customer' })
        .closest('th')
        ?.getAttribute('aria-sort') === 'descending',
      'Repeated sorting should use the latest state.',
    );

    await userEvent.click(canvas.getByRole('checkbox', { name: 'Select row 1' }));
    await waitFor(
      () =>
        canvas.getByRole('checkbox', { name: 'Select row 1' }).getAttribute('aria-checked') ===
        'true',
      'Selection should update controlled state.',
    );

    const resize = canvas.getByRole('separator', { name: 'Resize Customer column' });
    const before = Number(resize.getAttribute('aria-valuenow'));
    resize.focus();
    await userEvent.keyboard('{ArrowRight}');
    assert(
      Number(resize.getAttribute('aria-valuenow')) === before + 8,
      'Keyboard resizing should advance by the documented step.',
    );

    const scroll = canvas
      .queryByText('Customer ID')
      ?.closest('.data-table-scroll') as HTMLElement | null;
    const table = scroll?.querySelector('table');
    assert(scroll && table, 'The fixture should expose its scroll container and table.');
    assert(
      table.getBoundingClientRect().width >= scroll.clientWidth,
      'The table surface should cover the available viewport without trailing blank space.',
    );
  },
};

export const OverflowContract: Story = {
  render: () => (
    <div className="w-[32rem] p-6">
      <DataTable columns={wideColumns} data={customers.slice(0, 3)} />
    </div>
  ),
  tags: ['contract', '!autodocs'],
  play: async ({ canvas }) => {
    const scroll = canvas.getByText('Customer ID').closest('.data-table-scroll');
    const table = scroll?.querySelector('table');
    assert(scroll && table, 'The overflow fixture should expose its table viewport.');
    assert(
      scroll.scrollWidth > scroll.clientWidth,
      'A genuinely narrow container should scroll horizontally.',
    );
    assert(
      Math.abs(table.getBoundingClientRect().width - scroll.scrollWidth) <= 1,
      'The table and header surface should span the real scrollable width without empty trailing space.',
    );
  },
};
