import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Badge } from '../../feedback/Badge';
import { DataTable, type DataTableColumn, type DataTableDensity } from './DataTable';

interface CaptureCustomer {
  id: string;
  name: string;
  status: 'active' | 'pending';
  owner: string;
}

const rows: CaptureCustomer[] = [
  { id: 'C-1001', name: 'Acme Industries', status: 'active', owner: 'Maya Chen' },
  { id: 'C-1002', name: 'Northwind Europe', status: 'pending', owner: 'Noah Williams' },
  { id: 'C-1003', name: 'Contoso Retail', status: 'active', owner: 'Ava Patel' },
];

const columns: DataTableColumn<CaptureCustomer>[] = [
  { id: 'id', header: 'Customer ID', accessor: 'id', width: 120 },
  { id: 'name', header: 'Customer', accessor: 'name', width: 220 },
  {
    id: 'status',
    header: 'Status',
    accessor: 'status',
    width: 120,
    cell: ({ value }) => (
      <Badge tone={value === 'active' ? 'success' : 'attention'}>{String(value)}</Badge>
    ),
  },
  { id: 'owner', header: 'Owner', accessor: 'owner', width: 180 },
];

const states = ['default', 'selected', 'sorted', 'loading', 'empty'] as const;

function CaptureTable({
  density,
  state,
}: {
  density: DataTableDensity;
  state: (typeof states)[number];
}) {
  return (
    <DataTable
      columns={columns}
      data={state === 'empty' || state === 'loading' ? [] : rows}
      data-design-canonical="true"
      data-design-source-id={`${density}-${state}`}
      defaultRowSelection={state === 'selected' ? { 'C-1002': true } : undefined}
      defaultSorting={state === 'sorted' ? [{ id: 'name', desc: false }] : undefined}
      density={density}
      enableRowSelection
      getRowId={(row) => row.id}
      loading={state === 'loading'}
      loadingRowCount={3}
    />
  );
}

const meta = {
  title: 'Nevo UI/Data/DataTable/Design Capture',
  tags: ['!dev', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const StateCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['DataTable']}>
      <div className="grid w-[48rem] gap-8 p-8">
        {(['compact', 'default'] as const).flatMap((density) =>
          states.map((state) => (
            <CaptureTable density={density} key={`${density}-${state}`} state={state} />
          )),
        )}
      </div>
    </DesignCaptureProvider>
  ),
  parameters: {
    designCapture: {
      component: 'DataTable',
      title: 'Data table',
      description: 'Density and stable visual states',
      kind: 'component',
      order: 138,
    },
  },
};
