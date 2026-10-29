import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { RadioGroup, RadioGroupOption } from './RadioGroup';

const meta = {
  title: 'Nevo UI/Forms/RadioGroup',
  component: RadioGroup,
  tags: ['autodocs'],
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="standard" className="max-w-md">
      <RadioGroupOption
        value="standard"
        label="Standard"
        description="Use the default processing path."
      />
      <RadioGroupOption
        value="priority"
        label="Priority"
        description="Process this record ahead of the normal queue."
      />
      <RadioGroupOption value="disabled" label="Unavailable option" disabled />
    </RadioGroup>
  ),
};

export const DisabledWithReason: Story = {
  render: () => (
    <RadioGroup defaultValue="existing" className="max-w-md">
      <RadioGroupOption
        value="existing"
        label="Use the current branch"
        description="Work continues on main."
      />
      <RadioGroupOption
        disabled
        value="new"
        label="Create a new branch"
        description="Branch creation is unavailable because the repository is read-only."
      />
    </RadioGroup>
  ),
};

export const DisabledWithReasonContract: Story = {
  ...DisabledWithReason,
  tags: ['contract', '!autodocs'],
  play: async ({ canvas }) => {
    const reason = canvas.getByText(/repository is read-only/);
    for (let node: HTMLElement | null = reason; node; node = node.parentElement) {
      if (getComputedStyle(node).opacity !== '1') {
        throw new Error('The disabled reason must not fade.');
      }
    }

    const disabledLabel = canvas.getByText('Create a new branch');
    if (
      getComputedStyle(disabledLabel).color ===
      getComputedStyle(canvas.getByText('Use the current branch')).color
    ) {
      throw new Error('The disabled label shows the disabled role.');
    }

    const radio = canvas.getByRole('radio', { name: 'Create a new branch' });
    if (!radio.hasAttribute('disabled') || radio.getAttribute('aria-describedby') !== reason.id) {
      throw new Error('The option stays disabled and described by its reason.');
    }
  },
};

/** Polls until the condition holds (no storybook/test import in the design-system package). */
async function until(condition: () => boolean, message: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(message);
}

function ControlledArchetypes({ initial, loop }: { initial: string; loop?: boolean }) {
  const [value, setValue] = useState(initial);

  return (
    <div className="grid max-w-md gap-3">
      <RadioGroup value={value} onValueChange={setValue} loop={loop} aria-label="Archetype">
        <RadioGroupOption value="minimal" label="Minimal" description="Small work." />
        <RadioGroupOption value="feature" label="Feature" description="A product change." />
        <RadioGroupOption
          value="architecture"
          label="Architecture"
          description="A module change."
        />
        <RadioGroupOption value="cross" label="Cross-module" description="Several modules." />
      </RadioGroup>
      <output aria-label="Selected archetype">{value || 'none'}</output>
      <button type="button">After the group</button>
    </div>
  );
}

/**
 * Arrow keys move focus AND select in a controlled group, even with a short key press (key up
 * before focus arrives), across every option and in both directions.
 */
export const ArrowKeysSelectEveryOption: Story = {
  render: () => <ControlledArchetypes initial="minimal" />,
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const names = ['Minimal', 'Feature', 'Architecture', 'Cross-module'];
    canvas.getByRole('radio', { name: 'Minimal' }).focus();
    for (const step of [1, 2, 3, 0, 3, 2, 1, 0]) {
      const current = names.findIndex(
        (name) => canvas.getByRole('radio', { name }) === document.activeElement,
      );
      const forward = step === (current + 1) % names.length;
      await userEvent.keyboard(forward ? '{ArrowDown}' : '{ArrowUp}');
      const target = canvas.getByRole('radio', { name: names[step] });
      await until(
        () => document.activeElement === target && target.getAttribute('aria-checked') === 'true',
        `${names[step]} is focused and selected by the arrow key.`,
      );
    }
  },
};

/** An arrow that moves nothing is forgotten: a later Tab onto an unchecked option selects nothing. */
export const TabAfterAnArrowThatMovedNothing: Story = {
  render: () => <ControlledArchetypes initial="" loop={false} />,
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const first = canvas.getByRole('radio', { name: 'Minimal' });
    first.focus();
    // At the start of a group without loop the arrow moves nothing.
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.tab();
    await until(
      () => document.activeElement === canvas.getByRole('button', { name: 'After the group' }),
      'Tab leaves the group.',
    );
    await userEvent.tab({ shift: true });
    await until(() => document.activeElement === first, 'Shift+Tab returns to the first option.');
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (canvas.getByLabelText('Selected archetype').textContent !== 'none') {
      throw new Error('Tab onto an unchecked option selects nothing.');
    }
  },
};
