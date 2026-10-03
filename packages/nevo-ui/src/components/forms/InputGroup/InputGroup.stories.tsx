import type { Meta, StoryObj } from '@storybook/react-vite';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Field } from '../Field';
import { Icon } from '../../foundations/Icon';
import { IconButton } from '../../actions/IconButton';
import { InputGroup } from './InputGroup';
import { TextInput } from '../TextInput';

const meta = {
  title: 'Nevo UI/Forms/InputGroup',
  component: InputGroup,
  tags: ['autodocs'],
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

async function settleColorTransition() {
  for (let frame = 0; frame < 12; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function resolvedColorToken(variable: string) {
  const probe = document.createElement('span');
  probe.style.color = `var(${variable})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

function SearchGroup({ action = false }: { action?: boolean }) {
  return (
    <InputGroup>
      <InputGroup.Addon>
        <Icon name="search" size="sm" />
      </InputGroup.Addon>
      <TextInput aria-label="Search" placeholder="Search records..." type="search" />
      {action ? (
        <InputGroup.Action>
          <IconButton aria-label="Clear search" icon="close" size="xs" />
        </InputGroup.Action>
      ) : null}
    </InputGroup>
  );
}

function StoryWidth({ children }: { children: React.ReactNode }) {
  return <div className="w-80">{children}</div>;
}

export const LeadingAddon: Story = {
  render: () => (
    <StoryWidth>
      <SearchGroup />
    </StoryWidth>
  ),
};

export const TrailingAction: Story = {
  render: () => (
    <StoryWidth>
      <InputGroup>
        <TextInput aria-label="Filter" placeholder="Filter records..." />
        <InputGroup.Action>
          <IconButton aria-label="Clear filter" icon="close" size="xs" />
        </InputGroup.Action>
      </InputGroup>
    </StoryWidth>
  ),
};

export const BothSides: Story = {
  render: () => (
    <StoryWidth>
      <SearchGroup action />
    </StoryWidth>
  ),
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('searchbox', { name: 'Search' });
    await userEvent.click(input);
    await settleColorTransition();
    const group = input.closest('.input-group');
    if (!(group instanceof HTMLElement))
      throw new Error('InputGroup surface should wrap its control.');
    const action = canvas.getByRole('button', { name: 'Clear search' });
    const groupRect = group.getBoundingClientRect();
    const actionRect = action.getBoundingClientRect();
    if (actionRect.width !== 24 || actionRect.height !== 24) {
      throw new Error('InputGroup icon action should use the compact 24px IconButton.');
    }
    const contentInset =
      groupRect.right -
      actionRect.right -
      Number.parseFloat(getComputedStyle(group).borderRightWidth);
    if (Math.round(contentInset) !== 8) {
      throw new Error('InputGroup action should retain an 8px trailing inset.');
    }
    if (getComputedStyle(group).borderTopColor !== resolvedColorToken('--color-focus-ring')) {
      throw new Error('InputGroup should own the focused border.');
    }
    if (getComputedStyle(input).outlineStyle !== 'none') {
      throw new Error('Nested TextInput should not draw a second focus outline.');
    }
  },
};

export const InsideField: Story = {
  render: () => (
    <Field className="w-80">
      <Field.Label>Search</Field.Label>
      <SearchGroup action />
      <Field.Description>Search across the current collection.</Field.Description>
    </Field>
  ),
};

export const CompositionCapture: Story = {
  render: () => (
    <DesignCaptureProvider captureComponents={['InputGroup']}>
      <StoryWidth>
        <SearchGroup action />
      </StoryWidth>
    </DesignCaptureProvider>
  ),
  tags: ['!dev', '!autodocs'],
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    designCapture: {
      component: 'InputGroup',
      title: 'Input group',
      description: 'One coherent control surface composed from addons, a control and actions',
      kind: 'component',
      order: 18,
    },
  },
};
