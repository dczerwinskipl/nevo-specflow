import { useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';

import {
  AppContent,
  AppContentContainer,
  AppShell,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceProvider,
  APP_NAVIGATION_INLINE_PADDING,
  WorkspaceHeader,
  useAppNavigation,
  useSecondaryNavigation,
  useSecondaryStack,
  defineSecondaryStack,
  type SecondaryData,
  type SecondaryScreenProps,
} from '@nevo/ui';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SideNavigation,
  TextArea,
  TextInput,
  Typography,
  type DataTableColumn,
  type NavigationAdapter,
  type NavigationNode,
  type StatusTone,
} from '@nevo/ui';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '@nevo/ui';

type CustomerStatus = 'Active' | 'Lead' | 'At risk';
type CustomerSegment = 'Enterprise' | 'Growth' | 'Startup';

interface Customer {
  id: string;
  company: string;
  contact: string;
  email: string;
  status: CustomerStatus;
  segment: CustomerSegment;
  owner: string;
  annualValue: number;
  notes: string;
}

const initialCustomers: Customer[] = [
  {
    id: 'northstar',
    company: 'Northstar Labs',
    contact: 'Maya Chen',
    email: 'maya@northstar.example',
    status: 'Active',
    segment: 'Enterprise',
    owner: 'Alex Morgan',
    annualValue: 128000,
    notes: 'Renewal planning starts next month. Product analytics is the main expansion path.',
  },
  {
    id: 'atlas',
    company: 'Atlas & Co.',
    contact: 'Jon Bell',
    email: 'jon@atlas.example',
    status: 'Lead',
    segment: 'Growth',
    owner: 'Priya Shah',
    annualValue: 54000,
    notes: 'Discovery completed. Send the security overview before the next call.',
  },
  {
    id: 'relay',
    company: 'Relay Works',
    contact: 'Sam Rivera',
    email: 'sam@relay.example',
    status: 'At risk',
    segment: 'Enterprise',
    owner: 'Alex Morgan',
    annualValue: 92000,
    notes: 'Support response time is the current concern. Weekly check-in is scheduled.',
  },
  {
    id: 'orbit',
    company: 'Orbit Finance',
    contact: 'Lina Brooks',
    email: 'lina@orbit.example',
    status: 'Active',
    segment: 'Growth',
    owner: 'Noah Williams',
    annualValue: 68000,
    notes: 'Healthy account. Interested in adding the reporting workspace for operations.',
  },
  {
    id: 'kinetic',
    company: 'Kinetic Studio',
    contact: 'Owen Reed',
    email: 'owen@kinetic.example',
    status: 'Lead',
    segment: 'Startup',
    owner: 'Priya Shah',
    annualValue: 18000,
    notes: 'Evaluating the product with a five-person team.',
  },
];

const navigationNodes = [
  {
    key: 'customers',
    label: 'Customers',
    children: [
      { key: 'customer-list', label: 'All customers', target: 'customers' },
      { key: 'customer-segments', label: 'Segments', target: 'segments' },
    ],
  },
  { key: 'pipeline', label: 'Pipeline', target: 'pipeline' },
  { key: 'tasks', label: 'Tasks', target: 'tasks' },
  { key: 'reports', label: 'Reports', target: 'reports' },
  { key: 'settings', label: 'Settings', target: 'settings' },
] as const satisfies readonly NavigationNode<string>[];

const rootIcons = {
  customers: 'users',
  pipeline: 'workflow',
  tasks: 'list-checks',
  reports: 'file',
  settings: 'settings',
} as const;

const statusTone: Record<CustomerStatus, StatusTone> = {
  Active: 'success',
  Lead: 'info',
  'At risk': 'attention',
};

export const crmIdentity = {
  coreColor: '#1687ff',
  secondaryColor: '#16e0cf',
} as const;

export const crmEnvironmentPrimary = crmIdentity.coreColor;
const crmActionPrimary = `color-mix(in oklab, ${crmIdentity.coreColor}, black 24%)`;
const crmTheme = {
  '--color-action-primary': crmActionPrimary,
  '--color-action-primary-hover': `color-mix(in oklab, ${crmIdentity.coreColor}, black 32%)`,
  '--color-content-on-primary': '#ffffff',
  '--color-content-link': crmIdentity.secondaryColor,
  '--color-content-link-hover': `color-mix(in oklab, ${crmIdentity.secondaryColor}, white 18%)`,
  '--color-focus-ring': crmActionPrimary,
  '--color-progress-fill': crmActionPrimary,
} as CSSProperties;

function CrmNavigation() {
  const { closeNavigation } = useAppNavigation();
  const [activeKey, setActiveKey] = useState('customer-list');
  const adapter = useMemo<NavigationAdapter<string>>(
    () => ({
      match: (node) => (node.key === activeKey ? 'active' : 'none'),
      renderLink: ({ children, className, node }) => (
        <button
          className={cn(className, 'w-full text-left')}
          onClick={() => {
            setActiveKey(node.key);
            closeNavigation();
          }}
          type="button"
        >
          {children}
        </button>
      ),
    }),
    [activeKey, closeNavigation],
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ paddingInline: APP_NAVIGATION_INLINE_PADDING }}
    >
      <div className="border-b border-border-subtle py-5">
        <Typography as="div" variant="title-md">
          Acme CRM
        </Typography>
      </div>
      <SideNavigation
        aria-label="CRM navigation"
        adapter={adapter}
        className="min-h-0 flex-1 py-4"
        defaultExpandedKeys={['customers']}
        label="Workspace"
        nodes={navigationNodes}
        rootIcons={rootIcons}
      />
      <div className="border-t border-border-subtle py-4">
        <Typography as="div" variant="label-sm">
          Alex Morgan
        </Typography>
        <Typography as="div" className="mt-0.5 text-content-muted" variant="body-sm">
          Account manager
        </Typography>
      </div>
    </div>
  );
}

function CustomerEditor({
  customer,
  onSave,
  onCancel,
}: {
  customer: Customer;
  onSave: (customer: Customer) => void;
  onCancel: () => void;
}) {

  const [draft, setDraft] = useState(customer);

  const update = <Key extends keyof Customer>(key: Key, value: Customer[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <AppContent className="w-content-narrow max-w-full">
      <AppWorkspaceBody>
        <AppContentContainer align="start" className="grid gap-5" size="full">
          <div className="grid gap-4 @sm:grid-cols-2">
            <Field className="@sm:col-span-2">
              <Field.Label>Company</Field.Label>
              <TextInput
                onChange={(event) => update('company', event.target.value)}
                value={draft.company}
              />
            </Field>
            <Field>
              <Field.Label>Contact</Field.Label>
              <TextInput
                onChange={(event) => update('contact', event.target.value)}
                value={draft.contact}
              />
            </Field>
            <Field>
              <Field.Label>Email</Field.Label>
              <TextInput
                onChange={(event) => update('email', event.target.value)}
                type="email"
                value={draft.email}
              />
            </Field>
            <Field>
              <Field.Label>Status</Field.Label>
              <Select
                onValueChange={(value) => update('status', value as CustomerStatus)}
                value={draft.status}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Lead">Lead</SelectItem>
                  <SelectItem value="At risk">At risk</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <Field.Label>Segment</Field.Label>
              <Select
                onValueChange={(value) => update('segment', value as CustomerSegment)}
                value={draft.segment}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Enterprise">Enterprise</SelectItem>
                  <SelectItem value="Growth">Growth</SelectItem>
                  <SelectItem value="Startup">Startup</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field className="@sm:col-span-2">
              <Field.Label>Account owner</Field.Label>
              <Select onValueChange={(value) => update('owner', value)} value={draft.owner}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Alex Morgan">Alex Morgan</SelectItem>
                  <SelectItem value="Priya Shah">Priya Shah</SelectItem>
                  <SelectItem value="Noah Williams">Noah Williams</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field className="@sm:col-span-2">
              <Field.Label>Notes</Field.Label>
              <TextArea
                minRows={5}
                onChange={(event) => update('notes', event.target.value)}
                value={draft.notes}
              />
            </Field>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
            <Button onClick={() => void onCancel()} variant="ghost">
              Cancel
            </Button>
            <Button
              onClick={() => {
                onSave(draft);
                void onCancel();
              }}
            >
              Save changes
            </Button>
          </div>
        </AppContentContainer>
      </AppWorkspaceBody>
    </AppContent>
  );
}

function CustomerDetailsHeader({ customer }: { customer: Customer }) {
  return (
    <WorkspaceHeader
      status={
        <Badge className="shrink-0" tone={statusTone[customer.status]}>
          {customer.status}
        </Badge>
      }
      title={customer.company}
    />
  );
}

function CustomersHeader({ count, onAdd }: { count: number; onAdd: () => void }) {
  return (
    <WorkspaceHeader
      actions={[
        {
          id: 'create-customer',
          label: 'New customer',
          icon: 'plus',
          primary: true,
          onPress: onAdd,
        },
      ]}
      icon="users"
      subtitle={`${count} accounts`}
      title="Customers"
    />
  );
}

function NoCustomerSelected() {
  return (
    <AppContent className="w-content-narrow max-w-full">
      <AppWorkspaceBody className="flex items-center justify-center">
        <EmptyState
          className="w-full border-0"
          description="Choose a row to review and edit account details."
          icon="database"
          title="Select a customer"
        />
      </AppWorkspaceBody>
    </AppContent>
  );
}

function createBlankCustomer(): Customer {
  return {
    id: `customer-${Date.now()}`,
    company: 'New customer',
    contact: '',
    email: '',
    status: 'Lead',
    segment: 'Startup',
    owner: 'Alex Morgan',
    annualValue: 0,
    notes: '',
  };
}

function createCustomerStore() {
  let snapshot: readonly Customer[] = initialCustomers;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => snapshot,
    save: (customer: Customer) => {
      const exists = snapshot.some(item => item.id === customer.id);
      snapshot = exists
        ? snapshot.map(item => item.id === customer.id ? customer : item)
        : [customer, ...snapshot];
      for (const listener of listeners) listener();
    },
  };
}

type CustomerStore = ReturnType<typeof createCustomerStore>;
type CustomerPages = { editor: Record<never, never>; billing: Record<never, never> };

function createCustomerStack(store: CustomerStore) {
  function useCustomerData({ id }: { id: string }): SecondaryData<Customer> {
    const customers = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const customer = customers.find(value => value.id === id);
    return customer
      ? { status: 'ready', data: customer }
      : { status: 'unavailable', message: 'This customer is no longer available.' };
  }
  function Editor({ data }: SecondaryScreenProps<Customer, CustomerPages['editor']>) {
    const navigation = useSecondaryStack<CustomerPages>();
    return <div>
      <div className="p-4">
        <Button size="sm" variant="secondary" onClick={() => void navigation.navTo('billing')}>
          Billing history
        </Button>
      </div>
      <CustomerEditor
        customer={data}
        onSave={store.save}
        onCancel={() => void navigation.close()}
      />
    </div>;
  }
  function Billing({ data }: SecondaryScreenProps<Customer, CustomerPages['billing']>) {
    return <div className="grid gap-3 p-4">
      <Typography variant="title-sm">Billing history</Typography>
      <Typography variant="body-sm">{data.company}</Typography>
      <Typography variant="body-sm">Annual value: {data.annualValue}</Typography>
    </div>;
  }
  return defineSecondaryStack<{ id: string }, Customer, CustomerPages>({
    id: 'crm-customer', initial: 'editor', useData: useCustomerData,
    screens: {
      editor: { title: 'Customer details', component: Editor },
      billing: { title: 'Billing history', component: Billing },
    },
  });
}

function CrmScreen({ initialCustomerId }: { initialCustomerId?: string }) {
  const navigation = useSecondaryNavigation();
  const [store] = useState(createCustomerStore);
  const customers = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [customerStack] = useState(() => createCustomerStack(store));
  const [defaultOpen, setDefaultOpen] = useState(true);
  const [query, setQuery] = useState('');
  const initialCustomer = initialCustomerId
    ? customers.find((customer) => customer.id === initialCustomerId)
    : undefined;

  const filteredCustomers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return customers;
    return customers.filter((customer) =>
      [customer.company, customer.contact, customer.email, customer.owner, customer.segment].some(
        (value) => value.toLocaleLowerCase().includes(normalized),
      ),
    );
  }, [customers, query]);

  const columns = useMemo<readonly DataTableColumn<Customer>[]>(
    () => [
      {
        id: 'company',
        header: 'Company',
        accessor: 'company',
        sortable: true,
        width: 210,
        cell: ({ row }) => (
          <div className="min-w-0">
            <Typography as="div" className="truncate" variant="label-md">
              {row.company}
            </Typography>
            <Typography as="div" className="truncate text-content-muted" variant="body-sm">
              {row.email}
            </Typography>
          </div>
        ),
      },
      { id: 'contact', header: 'Contact', accessor: 'contact', sortable: true, width: 150 },
      {
        id: 'status',
        header: 'Status',
        accessor: 'status',
        width: 100,
        cell: ({ row }) => <Badge tone={statusTone[row.status]}>{row.status}</Badge>,
      },
      { id: 'segment', header: 'Segment', accessor: 'segment', sortable: true, width: 120 },
      { id: 'owner', header: 'Owner', accessor: 'owner', sortable: true, width: 150 },
      {
        id: 'annualValue',
        header: 'Annual value',
        accessor: 'annualValue',
        align: 'end',
        sortable: true,
        width: 130,
        cell: ({ row }) =>
          new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          }).format(row.annualValue),
      },
    ],
    [],
  );

  const saveCustomer = store.save;
  const openCustomer = (customer: Customer) => navigation.open(customerStack, { id: customer.id });

  return (
    <AppShell
      brandPrimary={crmEnvironmentPrimary}
      navigation={<CrmNavigation />}
      style={{ ...crmTheme, height: '100%', width: '100%' }}
    >
      <AppWorkspace split="primary">
        <AppWorkspace.Primary
          header={
            <CustomersHeader
              count={filteredCustomers.length}
              onAdd={() => {
                const customer = createBlankCustomer();
                saveCustomer(customer);
                void openCustomer(customer);
              }
            />
          }
        >
          <AppContent className="w-content-xwide max-w-full">
            <AppWorkspaceBody>
              <AppContentContainer size="full">
                <DataTable
                  columns={columns}
                  data={filteredCustomers}
                  defaultSorting={[{ id: 'company', desc: false }]}
                  getRowActionLabel={(customer) => `Edit ${customer.company}`}
                  getRowId={(customer) => customer.id}
                  hasActiveFilters={query.length > 0}
                  onRowClick={(customer) => void openCustomer(customer)}
                  showColumnVisibility
                  toolbar={
                    <TextInput
                      aria-label="Search customers"
                      className="max-w-72"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search customers"
                      type="search"
                      value={query}
                    />
                  }
                />
              </AppContentContainer>
            </AppWorkspaceBody>
          </AppContent>
        </AppWorkspace.Primary>
        <AppWorkspace.Secondary
          open={defaultOpen}
          onOpenChange={setDefaultOpen}
          header={
            initialCustomer ? <CustomerDetailsHeader customer={initialCustomer} /> : undefined
          }
        >
          {initialCustomer ? (
            <CustomerEditor customer={initialCustomer} onSave={saveCustomer} onCancel={() => setDefaultOpen(false)} />
          ) : (
            <NoCustomerSelected />
          )}
        </AppWorkspace.Secondary>
      </AppWorkspace>
    </AppShell>
  );
}

export interface CrmExampleProps {
  height?: CSSProperties['height'];
  initialCustomerId?: string;
  width?: CSSProperties['width'];
}

export function CrmExample({
  height = '100dvh',
  initialCustomerId,
  width = '100%',
}: CrmExampleProps = {}) {
  const capture = useDesignMetadata('CrmExampleScreen', { viewport: 'desktop' });

  return (
    <div
      className="relative overflow-hidden"
      data-crm-example="root"
      style={{ height, width }}
      {...capture}
    >
      <div className="h-full w-full" {...designSlot('CrmExampleScreen', 'shell')}>
        <AppWorkspaceProvider>
          <CrmScreen initialCustomerId={initialCustomerId} />
        </AppWorkspaceProvider>
      </div>
    </div>
  );
}
