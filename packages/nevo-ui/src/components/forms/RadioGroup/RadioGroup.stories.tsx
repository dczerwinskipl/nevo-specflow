import type { Meta, StoryObj } from '@storybook/react-vite';
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
      if (getComputedStyle(node).opacity !== '1')
        throw new Error('The disabled reason must not fade.');
    }
    const disabledLabel = canvas.getByText('Create a new branch');
    if (
      getComputedStyle(disabledLabel).color ===
      getComputedStyle(canvas.getByText('Use the current branch')).color
    )
      throw new Error('The disabled label shows the disabled role.');
    const radio = canvas.getByRole('radio', { name: 'Create a new branch' });
    if (!radio.hasAttribute('disabled') || radio.getAttribute('aria-describedby') !== reason.id)
      throw new Error('The option stays disabled and described by its reason.');
  },
};

/**
 * Arrow keys move focus AND select, even with a short key press (key up before focus arrives),
 * across every option of a controlled group.
 */
export const ArrowKeysSelectEveryOption: Story = {
  render: () => (
    <RadioGroup defaultValue="minimal" className="max-w-md" aria-label="Archetype">
      <RadioGroupOption value="minimal" label="Minimal" description="Small work." />
      <RadioGroupOption value="feature" label="Feature" description="A product change." />
      <RadioGroupOption value="architecture" label="Architecture" description="A module change." />
      <RadioGroupOption value="cross" label="Cross-module" description="Several modules." />
    </RadioGroup>
  ),
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
      await new Promise((resolve) => setTimeout(resolve, 50));
      const target = canvas.getByRole('radio', { name: names[step] });
      if (document.activeElement !== target) throw new Error(`Focus moves to ${names[step]}.`);
      if (target.getAttribute('aria-checked') !== 'true')
        throw new Error(`${names[step]} is selected by the arrow key.`);
    }
  },
};
