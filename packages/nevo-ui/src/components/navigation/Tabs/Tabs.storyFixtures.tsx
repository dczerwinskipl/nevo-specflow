import { useState, type ReactNode } from 'react';
import { Typography } from '../../foundations/Typography';
import { Tabs } from './Tabs';

const tabItems = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity' },
  { value: 'settings', label: 'Settings' },
] as const;

export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border-default bg-surface px-4 py-3">
      <Typography as="p" className="m-0 text-content-muted" variant="body-sm">
        {children}
      </Typography>
    </div>
  );
}

export function TabsExample({
  disabledActivity = false,
  defaultValue = 'overview',
  value,
  onValueChange,
}: {
  disabledActivity?: boolean;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const tabs = tabItems.map((item) => (
    <Tabs.Trigger
      disabled={disabledActivity && item.value === 'activity'}
      key={item.value}
      value={item.value}
    >
      {item.label}
    </Tabs.Trigger>
  ));
  const panels = tabItems.map((item) => (
    <Tabs.Content key={item.value} value={item.value}>
      <Panel>{item.label} content for the active customer record.</Panel>
    </Tabs.Content>
  ));

  if (value !== undefined && onValueChange) {
    return (
      <div className="rounded-xl bg-canvas p-6 text-content-primary">
        <Tabs className="w-[30rem] max-w-full" onValueChange={onValueChange} value={value}>
          <Tabs.List aria-label="Customer record sections">{tabs}</Tabs.List>
          {panels}
        </Tabs>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-canvas p-6 text-content-primary">
      <Tabs className="w-[30rem] max-w-full" defaultValue={defaultValue}>
        <Tabs.List aria-label="Customer record sections">{tabs}</Tabs.List>
        {panels}
      </Tabs>
    </div>
  );
}

export function ControlledTabs() {
  const [value, setValue] = useState('overview');
  return (
    <div data-selected-tab={value}>
      <TabsExample onValueChange={setValue} value={value} />
    </div>
  );
}
