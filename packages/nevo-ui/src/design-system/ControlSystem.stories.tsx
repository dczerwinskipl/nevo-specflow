import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  Icon,
  IconButton,
  InputGroup,
  MessageComposer,
  SideNavigation,
  Tabs,
  TextInput,
  Typography,
  type NavigationAdapter,
  type NavigationNode,
} from '../components';

const actionVariants = ['primary', 'secondary', 'ghost', 'destructive'] as const;

interface AuditTarget {
  href: string;
}

const navigationNodes = [
  { key: 'customers', label: 'Customers', target: { href: '#customers' } },
] satisfies readonly NavigationNode<AuditTarget>[];

const navigationAdapter: NavigationAdapter<AuditTarget> = {
  match: () => 'active',
  renderLink: ({ children, className, isActive, node }) => (
    <a aria-current={isActive ? 'page' : undefined} className={className} href={node.target?.href}>
      {children}
    </a>
  ),
};

function Section({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="grid gap-4 rounded-surface border border-border-default bg-surface p-5">
      <div>
        <Typography as="h2" className="m-0 text-content-primary" variant="title-sm">
          {title}
        </Typography>
        <Typography as="p" className="mb-0 mt-1 text-content-muted" variant="body-sm">
          {description}
        </Typography>
      </div>
      {children}
    </section>
  );
}

function DefaultControlAlignment() {
  return (
    <div className="flex flex-wrap items-start gap-3" data-testid="default-control-alignment">
      <Button data-control-audit="button">Save</Button>
      <IconButton aria-label="Add record" data-control-audit="icon-button" icon="plus" />
      <div className="w-48">
        <TextInput
          aria-label="Search records"
          data-control-audit="text-input"
          placeholder="Search records..."
        />
      </div>
      <div className="w-56">
        <InputGroup data-control-audit="input-group">
          <InputGroup.Addon>
            <Icon name="search" size="sm" />
          </InputGroup.Addon>
          <TextInput aria-label="Grouped search" placeholder="Grouped search..." />
          <InputGroup.Action>
            <IconButton aria-label="Clear grouped search" icon="close" size="xs" />
          </InputGroup.Action>
        </InputGroup>
      </div>
      <Tabs defaultValue="overview">
        <Tabs.List aria-label="Audit tabs">
          <Tabs.Trigger data-control-audit="tabs-trigger" value="overview">
            Overview
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content className="sr-only" value="overview">
          Overview
        </Tabs.Content>
      </Tabs>
    </div>
  );
}

function ControlSystemAudit() {
  return (
    <main className="min-h-screen bg-canvas p-8 text-content-primary">
      <div className="mx-auto grid max-w-5xl gap-6">
        <header>
          <Typography as="h1" className="m-0" variant="title-lg">
            Nevo control system
          </Typography>
          <Typography as="p" className="mb-0 mt-2 max-w-2xl text-content-muted" variant="body-md">
            A compact visual contract for shared sizing, action hierarchy and interaction language.
          </Typography>
        </header>

        <Section
          title="Default rhythm · 36 px"
          description="Default Button, IconButton, TextInput, InputGroup and Tabs.Trigger align without consumer overrides."
        >
          <DefaultControlAlignment />
        </Section>

        <Section
          title="Action hierarchy"
          description="Labelled and icon-only actions share the same primary, secondary, ghost and destructive recipes."
        >
          <div className="grid gap-3">
            {actionVariants.map((variant) => (
              <div className="flex items-center gap-3" key={variant}>
                <Typography className="w-24 capitalize text-content-muted" variant="body-sm">
                  {variant}
                </Typography>
                <Button variant={variant}>{variant}</Button>
                <IconButton aria-label={`${variant} action`} icon="plus" variant={variant} />
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Density hierarchy"
          description="Inline is reserved for embedded icon actions; compact supports toolbars and navigation; default anchors forms and ordinary actions."
        >
          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <Typography className="w-24 text-content-muted" variant="body-sm">
                Inline · 24
              </Typography>
              <IconButton aria-label="Inline add" icon="plus" size="xs" />
            </div>
            <div className="flex items-start gap-3">
              <Typography className="w-24 pt-2 text-content-muted" variant="body-sm">
                Compact · 32
              </Typography>
              <Button size="sm">Template</Button>
              <IconButton aria-label="Compact add" icon="plus" size="sm" />
              <div className="w-48" data-testid="navigation-row">
                <SideNavigation
                  aria-label="Audit navigation"
                  adapter={navigationAdapter}
                  nodes={navigationNodes}
                />
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="State language"
          description="Hover the controls or move through them with Tab. Focus never changes geometry; invalid and disabled stay semantically distinct."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput aria-label="Default state" defaultValue="Default" />
            <TextInput aria-invalid="true" aria-label="Invalid state" defaultValue="Invalid" />
            <TextInput aria-label="Disabled state" defaultValue="Disabled" disabled />
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section
          title="Composite surface"
          description="MessageComposer keeps its larger surface role while embedding inline and compact actions from the same control system."
        >
          <MessageComposer onSubmit={() => undefined}>
            <MessageComposer.Editor
              aria-label="Audit message"
              defaultValue="A composed message keeps its own spacing hierarchy."
            />
            <MessageComposer.Toolbar>
              <IconButton aria-label="Attach file" icon="file" size="xs" />
              <Button size="sm" type="submit">
                Send
              </Button>
            </MessageComposer.Toolbar>
          </MessageComposer>
        </Section>
      </div>
    </main>
  );
}

const meta = {
  title: 'Nevo UI/Foundations/Control System',
  component: ControlSystemAudit,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ControlSystemAudit>;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const VisualAudit: Story = {
  play: async ({ canvas }) => {
    const alignment = canvas.getByTestId('default-control-alignment');
    for (const control of alignment.querySelectorAll<HTMLElement>('[data-control-audit]')) {
      assert(
        control.getBoundingClientRect().height === 36,
        `${control.dataset.controlAudit} should be 36px tall.`,
      );
    }

    const navigationHost = canvas.getByTestId('navigation-row');
    const navigationRow = navigationHost.querySelector<HTMLElement>('[data-navigation-state]');
    assert(
      navigationRow?.getBoundingClientRect().height === 32,
      'Navigation rows should use the compact 32px rhythm.',
    );
  },
};
