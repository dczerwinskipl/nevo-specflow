import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-capture/metadata';
import { Badge } from '../../feedback/Badge';
import { Icon } from '../../foundations/Icon';
import { Typography } from '../../foundations/Typography';
import { Field } from '../Field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './Select';

const statusOptions = [
  ['active', 'Active'],
  ['paused', 'Paused'],
  ['archived', 'Archived'],
] as const;

function StatusSelect({
  autoFocus = false,
  disabled = false,
  invalid = false,
  longLabels = false,
}: {
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  longLabels?: boolean;
}) {
  return (
    <Field className="w-80" disabled={disabled} invalid={invalid}>
      <Field.Label>Status</Field.Label>
      <Select
        defaultValue={longLabels ? 'approval' : 'active'}
        disabled={disabled}
        invalid={invalid}
      >
        <SelectTrigger autoFocus={autoFocus}>
          <SelectValue placeholder="Choose a status" />
        </SelectTrigger>
        <SelectContent aria-label="Status options">
          <SelectGroup>
            <SelectLabel>Lifecycle</SelectLabel>
            {statusOptions.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
          {longLabels ? (
            <>
              <SelectSeparator />
              <SelectItem
                textValue="Requires executive approval"
                title="Requires executive approval before the account can be reactivated"
                value="approval"
              >
                Requires executive approval before the account can be reactivated
              </SelectItem>
            </>
          ) : null}
        </SelectContent>
      </Select>
      {invalid ? (
        <Field.Error>Select a valid lifecycle status.</Field.Error>
      ) : (
        <Field.Description>Used in customer filters and record views.</Field.Description>
      )}
    </Field>
  );
}

function ControlledSelect() {
  const [value, setValue] = useState('active');

  return (
    <div data-value={value}>
      <Field className="w-80">
        <Field.Label>Status</Field.Label>
        <Select onValueChange={setValue} value={value}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent aria-label="Status options">
            {statusOptions.map(([optionValue, label]) => (
              <SelectItem key={optionValue} value={optionValue}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function SelectTriggerMatrix() {
  return (
    <div className="grid w-80 gap-4">
      <Field>
        <Field.Label>Default</Field.Label>
        <Select defaultValue="default">
          <SelectTrigger data-design-source-id="default">
            <SelectValue>Active</SelectValue>
          </SelectTrigger>
        </Select>
      </Field>
      <Field>
        <Field.Label>Focus</Field.Label>
        <Select defaultValue="focus">
          <SelectTrigger autoFocus data-design-source-id="focus">
            <SelectValue>Active</SelectValue>
          </SelectTrigger>
        </Select>
      </Field>
      <Field disabled>
        <Field.Label>Disabled</Field.Label>
        <Select defaultValue="disabled" disabled>
          <SelectTrigger data-design-source-id="disabled">
            <SelectValue>Unavailable</SelectValue>
          </SelectTrigger>
        </Select>
      </Field>
      <Field invalid>
        <Field.Label>Invalid</Field.Label>
        <Select defaultValue="invalid" invalid>
          <SelectTrigger data-design-source-id="invalid">
            <SelectValue>Unknown status</SelectValue>
          </SelectTrigger>
        </Select>
      </Field>
    </div>
  );
}

function SelectItemMatrix() {
  return (
    <div className="flex min-h-72 items-center justify-center bg-canvas p-8">
      <div className="w-56">
        <Select open value="highlighted">
          <SelectTrigger aria-label="Option states" tabIndex={-1}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent aria-label="Select item states">
            <SelectItem data-design-source-id="default" value="default">
              Default option
            </SelectItem>
            <SelectItem autoFocus data-design-source-id="highlighted" value="highlighted">
              Highlighted option
            </SelectItem>
            <SelectItem data-design-source-id="disabled" disabled value="disabled">
              Disabled option
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function BranchLabel({ name }: { name: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Icon name="branch" size="sm" />
      <Typography as="span" className="min-w-0 truncate" variant="code-md">
        {name}
      </Typography>
    </span>
  );
}

const longBranch = 'feature/platform-wide-integration-of-the-new-workspace-lifecycle-and-recovery';
const longReason =
  'Has unsaved changes in the working tree. Save or discard them before using this branch as a merge target.';

/** Branch option contract: icon + code-md name, wrapping description, trailing meta badge. */
function BranchSelect({
  defaultValue = 'develop',
  open,
}: {
  defaultValue?: string;
  open?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div data-value={value}>
      <Field className="w-80">
        <Field.Label>Merge into</Field.Label>
        <Select defaultOpen={open} onValueChange={setValue} value={value}>
          <SelectTrigger tabIndex={open ? -1 : undefined}>
            <SelectValue placeholder="Choose a branch" />
          </SelectTrigger>
          <SelectContent aria-label="Branches">
            <SelectItem
              description="Main workspace"
              meta={<Badge tone="success">main</Badge>}
              textValue="develop"
              value="develop"
            >
              <BranchLabel name="develop" />
            </SelectItem>
            <SelectItem
              description="Shared with another spec"
              meta="2 specs"
              textValue="feature/platform"
              value="feature/platform"
            >
              <BranchLabel name="feature/platform" />
            </SelectItem>
            <SelectItem
              description="Unsaved changes. Save or discard them first."
              textValue="feature/payments"
              unavailable
              value="feature/payments"
            >
              <BranchLabel name="feature/payments" />
            </SelectItem>
            <SelectItem
              description="Workspace is being removed."
              disabled
              textValue="feature/legacy"
              value="feature/legacy"
            >
              <BranchLabel name="feature/legacy" />
            </SelectItem>
            <SelectItem description={longReason} meta="2 specs" textValue={longBranch} value="long">
              <BranchLabel name={longBranch} />
            </SelectItem>
            <SelectItem value="plain">Plain single-line option</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function StorySurface({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-64 items-center justify-center bg-canvas p-8 text-content-primary">
      {children}
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Forms/Select',
  component: StatusSelect,
  decorators: [
    (Story) => (
      <StorySurface>
        <Story />
      </StorySurface>
    ),
  ],
} satisfies Meta<typeof StatusSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitFor<T>(read: () => T | null | false, message: string): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = read();
    if (result) {
      return result;
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  throw new Error(message);
}

export const Default: Story = {};

export const Disabled: Story = { args: { disabled: true } };

export const Invalid: Story = { args: { invalid: true } };

export const LongOptions: Story = {
  args: { longLabels: true },
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Status' });
    const value = trigger.querySelector<HTMLElement>('[data-design-slot="value"]');
    const icon = trigger.querySelector<HTMLElement>('[data-design-slot="trailingIcon"]');
    assert(value && icon, 'The long-value fixture should expose its value and trailing icon.');
    const triggerRect = trigger.getBoundingClientRect();
    const valueRect = value.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    assert(
      getComputedStyle(trigger).overflow === 'hidden',
      'The trigger should clip overflowing value content.',
    );
    assert(
      getComputedStyle(value).textOverflow === 'ellipsis',
      'The selected value should use an ellipsis.',
    );
    assert(
      valueRect.right <= iconRect.left,
      'The selected value must reserve space for the trailing icon.',
    );
    assert(
      iconRect.right <= triggerRect.right,
      'The trailing icon must remain inside the trigger.',
    );
  },
};

export const Controlled: Story = {
  render: () => <ControlledSelect />,
};

export const InteractionContract: Story = {
  render: () => <ControlledSelect />,
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Status' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');

    const listbox = await waitFor(
      () => document.querySelector<HTMLElement>('[role="listbox"]'),
      'Select should open its listbox from the keyboard.',
    );
    assert(
      listbox.querySelector('[role="option"][data-state="checked"]') !== null,
      'The current value should be selected.',
    );

    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(
      () => document.querySelector('[role="listbox"]') === null,
      'Enter should choose and close.',
    );
    assert(
      trigger.textContent?.includes('Paused'),
      'Keyboard selection should update the controlled value.',
    );
    assert(
      trigger.closest('[data-value]')?.getAttribute('data-value') === 'paused',
      'Consumer state should own the value.',
    );
    assert(document.activeElement === trigger, 'Selection should restore focus to the trigger.');

    await userEvent.keyboard('{Enter}{Escape}');
    await waitFor(
      () => document.querySelector('[role="listbox"]') === null,
      'Escape should close the listbox.',
    );
    assert(document.activeElement === trigger, 'Escape should restore focus to the trigger.');
  },
};

export const StateCapture: Story = {
  decorators: [],
  render: () => (
    <DesignCaptureProvider captureComponents={['Select']}>
      <StorySurface>
        <SelectTriggerMatrix />
      </StorySurface>
    </DesignCaptureProvider>
  ),
  tags: ['capture', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'Select',
      title: 'Select',
      description: 'Single-value selection control with field-compatible states',
      kind: 'component',
      order: 36,
    },
  },
};

export const ItemStateCapture: Story = {
  decorators: [],
  render: () => (
    <DesignCaptureProvider captureComponents={['SelectItem']}>
      <SelectItemMatrix />
    </DesignCaptureProvider>
  ),
  tags: ['capture', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'SelectItem',
      title: 'Select item',
      description: 'Listbox option states with a selected check indicator',
      kind: 'component',
      order: 38,
    },
  },
};

function openListbox() {
  return document.querySelector<HTMLElement>('[role="listbox"]');
}

function optionByText(text: string) {
  const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (node) => node.textContent?.includes(text),
  );
  assert(option, `Option "${text}" should exist.`);

  return option;
}

function valueOf(trigger: HTMLElement) {
  return trigger.closest('[data-value]')?.getAttribute('data-value');
}

export const DescribedItems: Story = {
  render: () => <BranchSelect open />,
  tags: ['contract', '!autodocs'],
  // A statically open listbox has no focused item, so axe flags the scrollable viewport.
  parameters: { a11y: { test: 'off' }, layout: 'fullscreen' },
  play: async () => {
    await waitFor(openListbox, 'The listbox should be open.');
    const develop = optionByText('Main workspace');
    const describedBy = develop.getAttribute('aria-describedby')?.split(' ') ?? [];
    assert(describedBy.length === 2, 'Description and meta should both describe the option.');
    for (const id of describedBy) {
      assert(document.getElementById(id), 'aria-describedby should reference rendered nodes.');
    }

    const meta = develop.querySelector<HTMLElement>('[data-select-item-part="meta"]');
    const label = develop.querySelector<HTMLElement>('[data-design-slot="label"]');
    assert(meta && label, 'Meta and label should render.');
    assert(
      meta.getBoundingClientRect().left >= label.getBoundingClientRect().right,
      'Meta should sit to the right of the label.',
    );
    const plain = optionByText('Plain single-line option');
    assert(plain.getAttribute('aria-describedby') === null, 'Plain items stay unchanged.');
  },
};

export const BranchOption: Story = {
  render: () => <BranchSelect open />,
  tags: ['contract', '!autodocs'],
  // A statically open listbox has no focused item, so axe flags the scrollable viewport.
  parameters: { a11y: { test: 'off' }, layout: 'fullscreen' },
  play: async () => {
    await waitFor(openListbox, 'The listbox should be open.');
    const option = optionByText('Main workspace');
    assert(option.querySelector('svg'), 'A branch option should render the branch icon.');
    const name = option.querySelector<HTMLElement>('.font-mono');
    assert(name, 'The branch name should render.');
    assert(
      /monospace/i.test(getComputedStyle(name).fontFamily),
      'The branch name should use the code-md monospace role.',
    );
  },
};

export const DisabledWithReason: Story = {
  render: () => <BranchSelect open />,
  tags: ['contract', '!autodocs'],
  // A statically open listbox has no focused item, so axe flags the scrollable viewport.
  parameters: { a11y: { test: 'off' }, layout: 'fullscreen' },
  play: async () => {
    await waitFor(openListbox, 'The listbox should be open.');
    for (const [text, kind] of [
      ['Unsaved changes', 'unavailable'],
      ['Workspace is being removed.', 'disabled'],
    ] as const) {
      const option = optionByText(text);
      assert(option.getAttribute('aria-disabled') === 'true', `${kind} item is aria-disabled.`);
      const reason = option.querySelector<HTMLElement>('[data-select-item-part="description"]');
      assert(reason, `${kind} reason should render.`);
      assert(
        getComputedStyle(option).opacity === '1' && getComputedStyle(reason).opacity === '1',
        `${kind} reason should not be faded with the item.`,
      );
      const label = option.querySelector<HTMLElement>('[data-design-slot="label"]');
      assert(
        label && Number(getComputedStyle(label.parentElement!).opacity) < 1,
        `${kind} label should be muted.`,
      );
    }
  },
};

export const LongTextAt320: Story = {
  decorators: [
    (Story) => (
      <div className="w-80 bg-canvas text-content-primary">
        <Story />
      </div>
    ),
  ],
  render: () => <BranchSelect defaultValue="long" open />,
  tags: ['contract', '!autodocs'],
  // A statically open listbox has no focused item, so axe flags the scrollable viewport.
  parameters: { a11y: { test: 'off' }, layout: 'fullscreen' },
  play: async ({ canvas }) => {
    const listbox = await waitFor(openListbox, 'The listbox should be open.');
    const option = optionByText('Has unsaved changes in the working tree');
    const description = option.querySelector<HTMLElement>('[data-select-item-part="description"]');
    assert(description, 'The long description should render.');
    const lineHeight = parseFloat(getComputedStyle(description).lineHeight);
    assert(
      description.getBoundingClientRect().height > lineHeight * 1.5,
      'The description should wrap onto several lines.',
    );
    const label = option.querySelector<HTMLElement>('[data-design-slot="label"]');
    assert(label, 'The label should render.');
    assert(label.scrollWidth >= label.clientWidth, 'The main label stays single-line.');
    assert(
      listbox.scrollWidth <= listbox.clientWidth + 1,
      'Long text must not overflow the listbox horizontally.',
    );
    const trigger = canvas.getByRole('combobox', { name: 'Merge into', hidden: true });
    assert(trigger.getBoundingClientRect().width <= 320, 'The trigger fits 320 px.');
  },
};

export const KeyboardNavigation: Story = {
  render: () => <BranchSelect />,
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('combobox', { name: 'Merge into' });
    const initialHeight = trigger.getBoundingClientRect().height;
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(openListbox, 'Select should open from the keyboard.');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    const unavailable = optionByText('Unsaved changes');
    await waitFor(
      () => document.activeElement === unavailable,
      'The unavailable item should be reachable with the arrow keys.',
    );
    await userEvent.keyboard('{Enter}');
    assert(openListbox() !== null, 'Enter on an unavailable item must not close the listbox.');
    assert(valueOf(trigger) === 'develop', 'Enter on an unavailable item must not select it.');
    await userEvent.keyboard(' ');
    assert(valueOf(trigger) === 'develop', 'Space on an unavailable item must not select it.');
    await userEvent.click(unavailable);
    assert(openListbox() !== null, 'Clicking an unavailable item must keep the listbox open.');

    await userEvent.keyboard('{ArrowUp}{Enter}');
    await waitFor(() => openListbox() === null, 'Enter on an available item should close.');
    assert(valueOf(trigger) === 'feature/platform', 'The available item should be chosen.');
    const text = trigger.textContent ?? '';
    assert(
      text === 'feature/platform' &&
        !text.includes('Shared with another spec') &&
        !text.includes('2 specs'),
      'The trigger shows only the main label, without description or meta.',
    );
    assert(
      trigger.getBoundingClientRect().height === initialHeight,
      'The trigger stays a single line.',
    );
  },
};
