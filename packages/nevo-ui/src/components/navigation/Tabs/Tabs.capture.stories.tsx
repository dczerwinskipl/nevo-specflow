import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { Tabs } from './Tabs';
import { Panel } from './Tabs.storyFixtures';

const meta = {
  title: 'Nevo UI/Navigation/Tabs',
  tags: ['!dev', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

interface TriggerCaptureProps {
  selection: 'default' | 'selected';
  state: 'default' | 'focus' | 'disabled';
}

function TriggerCapture({ selection, state }: TriggerCaptureProps) {
  const selectedValue = selection === 'selected' ? 'captured' : 'other';
  return (
    <Tabs defaultValue={selectedValue}>
      <Tabs.List aria-label={`${selection} ${state} tab`}>
        <Tabs.Trigger
          autoFocus={state === 'focus'}
          data-design-canonical="true"
          data-design-source-id={`${selection}-${state}`}
          disabled={state === 'disabled'}
          value="captured"
        >
          Overview
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="captured">
        <Panel>Captured panel</Panel>
      </Tabs.Content>
      <Tabs.Content value="other">
        <Panel>Other panel</Panel>
      </Tabs.Content>
    </Tabs>
  );
}

function TabsCapture() {
  return (
    <div className="grid gap-10 p-8">
      <DesignCaptureProvider captureComponents={['Tabs']}>
        <Tabs
          className="w-[30rem]"
          data-design-canonical="true"
          data-design-source-id="default"
          defaultValue="overview"
        >
          <Tabs.List aria-label="Customer details">
            <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
            <Tabs.Trigger value="activity">Activity</Tabs.Trigger>
            <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="overview">
            <Panel>Customer summary and ownership details.</Panel>
          </Tabs.Content>
          <Tabs.Content value="activity">
            <Panel>Recent customer activity.</Panel>
          </Tabs.Content>
          <Tabs.Content value="settings">
            <Panel>Customer-specific settings.</Panel>
          </Tabs.Content>
        </Tabs>
      </DesignCaptureProvider>

      <DesignCaptureProvider captureComponents={['TabsTrigger']}>
        <div className="grid grid-cols-3 gap-6">
          {(['default', 'selected'] as const).flatMap((selection) =>
            (['default', 'focus', 'disabled'] as const).map((state) => (
              <TriggerCapture key={`${selection}-${state}`} selection={selection} state={state} />
            )),
          )}
        </div>
      </DesignCaptureProvider>
    </div>
  );
}

export const CanonicalCapture: Story = {
  render: () => <TabsCapture />,
  parameters: {
    designCapture: {
      component: 'Tabs',
      title: 'Tabs',
      description:
        'Accessible local-view switcher with reusable trigger variants and editable content slots',
      kind: 'component',
      order: 22,
    },
  },
};
