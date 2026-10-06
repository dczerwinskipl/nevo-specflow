import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { Button } from '../../actions/Button';
import { DataTable, type DataTableColumn } from '../../data/DataTable';
import { Badge } from '../../feedback/Badge';
import { TextInput } from '../../forms/TextInput';
import { Separator } from '../../layout/Separator';
import { Typography } from '../Typography';
import { AppBackground, WorkspaceSurface } from './Environment';

interface Account {
  company: string;
  owner: string;
  status: 'Active' | 'Review';
}

const accounts: Account[] = [
  { company: 'Northstar Labs', owner: 'Maya Chen', status: 'Active' },
  { company: 'Atlas & Co.', owner: 'Jon Bell', status: 'Review' },
  { company: 'Orbit Finance', owner: 'Lina Brooks', status: 'Active' },
];

const columns: DataTableColumn<Account>[] = [
  { id: 'company', header: 'Company', accessor: 'company', width: 240 },
  { id: 'owner', header: 'Owner', accessor: 'owner', width: 180 },
  {
    id: 'status',
    header: 'Status',
    accessor: 'status',
    width: 120,
    cell: ({ value }) => (
      <Badge tone={value === 'Active' ? 'success' : 'attention'}>{String(value)}</Badge>
    ),
  },
];

const meta = {
  title: 'Nevo UI/Foundations/Workspace',
  component: WorkspaceSurface,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof WorkspaceSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

function PreviewFrame({ children }: { children?: ReactNode }) {
  return (
    <AppBackground className="min-h-screen p-8">
      <WorkspaceSurface className="mx-auto min-h-[30rem] max-w-5xl rounded-surface border border-workspace-edge p-6">
        {children}
      </WorkspaceSurface>
    </AppBackground>
  );
}

export const Material: Story = {
  render: () => <PreviewFrame />,
};

export const WithControls: Story = {
  name: 'With controls',
  render: () => (
    <PreviewFrame>
      <div className="grid gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1">
            <Typography variant="title-md">Customer workspace</Typography>
            <Typography className="text-content-muted" variant="body-sm">
              Representative controls on the production workspace material.
            </Typography>
          </div>
          <Badge tone="info">3 accounts</Badge>
        </div>
        <Separator />
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            aria-label="Search accounts"
            className="max-w-72"
            placeholder="Search accounts"
          />
          <Button>New account</Button>
          <Button variant="secondary">Export</Button>
        </div>
        <DataTable columns={columns} data={accounts} density="compact" />
      </div>
    </PreviewFrame>
  ),
};

export const CanonicalCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['WorkspaceSurface']}>
      <AppBackground className="p-10">
        <WorkspaceSurface
          blur={false}
          className="h-[420px] w-[860px] rounded-surface border border-workspace-edge"
          data-design-canonical="true"
          data-design-source-id="material"
        />
      </AppBackground>
    </DesignCaptureProvider>
  ),
  tags: ['capture', '!autodocs'],
  parameters: {
    controls: { disable: true },
    designCapture: {
      component: 'WorkspaceSurface',
      title: 'Workspace surface',
      description: 'Neutral translucent material with local brand-derived reflected light.',
      kind: 'component',
      order: 6,
    },
  },
};
