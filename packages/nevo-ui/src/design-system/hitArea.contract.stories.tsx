import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { IconButton } from '../components/actions/IconButton';
import { Link } from '../components/actions/Link';
import { Checkbox, CheckboxField } from '../components/forms/Checkbox';
import { RadioGroup, RadioGroupItem } from '../components/forms/RadioGroup';
import { Switch, SwitchField } from '../components/forms/Switch';
import { Collapsible } from '../components/content/Collapsible';
import { Icon } from '../components/foundations/Icon';
import {
  treeLeafItemClassName,
  treeNodeClassName,
  treeRootClassName,
  treeRowActionClassName,
  treeRowClassName,
} from './treeRecipes';

const meta = {
  title: 'Nevo UI/Design System/Hit area',
  tags: ['contract', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** `--target-size` is what `@media (pointer: coarse)` sets on :root; the story forces it per surface. */
const touch = { '--target-size': 'var(--spacing-target-touch)' } as CSSProperties;

function Controls({ testId }: { testId: string }) {
  return (
    <div data-testid={testId} className="flex flex-wrap items-center gap-16 p-8">
      <Checkbox aria-label="Checkbox" />
      <RadioGroup aria-label="Radio" defaultValue="a">
        <RadioGroupItem aria-label="Radio option" value="a" />
      </RadioGroup>
      <Switch aria-label="Switch" />
      <IconButton aria-label="Extra small" icon="ellipsis" size="xs" />
      <IconButton aria-label="Small" icon="ellipsis" size="sm" />
      <IconButton aria-label="Medium" icon="ellipsis" size="md" />
      <Link href="#top" layout="standalone" tone="muted">
        Standalone link
      </Link>
    </div>
  );
}

function hit(x: number, y: number, target: Element) {
  const found = document.elementFromPoint(x, y);
  return found === target || (found !== null && target.contains(found));
}

function verify(root: HTMLElement, target: number) {
  const controls = root.querySelectorAll<HTMLElement>(
    '[role=checkbox],[role=radio],[role=switch],button,a[href]',
  );
  assert(controls.length >= 7, 'The fixture should render every control kind.');
  for (const control of controls) {
    const rect = control.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const halfW = Math.max(rect.width, target) / 2;
    const halfH = Math.max(rect.height, target) / 2;
    const name = control.getAttribute('aria-label') ?? control.textContent ?? control.tagName;
    assert(hit(cx - halfW + 1, cy, control), `${name}: left edge of the ${target}px area misses.`);
    assert(hit(cx + halfW - 1, cy, control), `${name}: right edge of the ${target}px area misses.`);
    assert(hit(cx, cy - halfH + 1, control), `${name}: top edge of the ${target}px area misses.`);
    assert(
      hit(cx, cy + halfH - 1, control),
      `${name}: bottom edge of the ${target}px area misses.`,
    );
    assert(!hit(cx - halfW - 3, cy, control), `${name}: hit area exceeds ${target}px on the left.`);
    assert(!hit(cx, cy - halfH - 3, control), `${name}: hit area exceeds ${target}px at the top.`);
    // Visual size never changes with the target size.
    assert(
      rect.height <= Math.max(36.5, target),
      `${name}: visual height should stay a control height (a standalone link is at least the target).`,
    );
  }
}

export const FinePointer24: Story = {
  render: () => <Controls testId="fine" />,
  play: async ({ canvas }) => verify(canvas.getByTestId('fine'), 24),
};

export const CoarsePointer44: Story = {
  render: () => (
    <div style={touch}>
      <Controls testId="coarse" />
    </div>
  ),
  play: async ({ canvas }) => verify(canvas.getByTestId('coarse'), 44),
};

export const FieldLabelsAreFullRowTargets: Story = {
  render: () => (
    <div className="w-80" style={touch}>
      <SwitchField label="Switch label" description="Description" />
      <div className="mt-6">
        <CheckboxField label="Checkbox label" />
      </div>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const switchControl = canvas.getByRole('switch');
    const label = canvas.getByText('Switch label');
    const rect = label.getBoundingClientRect();
    const row = label.closest('div')!.parentElement!.getBoundingClientRect();
    assert(rect.right >= row.right - 56, 'The switch label should span the row up to the switch.');
    assert(rect.width > 200, 'The label should not be shrink-wrapped to its text.');
    await userEvent.click(label);
    assert(switchControl.getAttribute('aria-checked') === 'true', 'Label click toggles.');
    // 44px block-axis target around the one-line label.
    const gapPoint = rect.top + rect.height / 2 + 20;
    assert(hit(rect.left + 20, gapPoint, label), 'Label hit area reaches 22px below its centre.');
  },
};

export const CompactTreeRowsKeepTheTouchTarget: Story = {
  render: () => (
    <div className="w-80" style={touch}>
      <ul className={treeRootClassName}>
        {['one.md', 'two.md', 'three.md'].map((name) => (
          <li className={treeNodeClassName} key={name}>
            <div className={treeRowClassName}>
              <button className={treeLeafItemClassName} type="button">
                <Icon name="file" />
                <span>{name}</span>
              </button>
              <IconButton
                aria-label={`Actions for ${name}`}
                className={treeRowActionClassName}
                icon="ellipsis"
                size="sm"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  ),
  play: async ({ canvas }) => {
    const actions = canvas.getAllByRole('button', { name: /^Actions for/ });
    const items = ['one.md', 'two.md', 'three.md'].map((name) =>
      canvas.getByText(name).closest('button')!,
    );
    // The visual rhythm stays compact on touch: rows are not stretched to the target size.
    const pitch = items[2]!.getBoundingClientRect().top - items[1]!.getBoundingClientRect().top;
    assert(pitch < 40, `The visual row stays compact on touch (${pitch}).`);
    // Hit areas still reach the 44px target around the visual: the later sibling wins overlaps.
    const action = actions[1]!;
    const rect = action.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    assert(hit(cx, cy - 21, action), 'The action hit area reaches 21px above the centre.');
    assert(hit(cx, cy, action), 'The action centre hits the action.');
    const target = items[1]!.getBoundingClientRect();
    const tx = target.left + 30;
    const ty = target.top + target.height / 2;
    assert(hit(tx, ty, items[1]!), 'The item centre hits the item.');
    assert(hit(tx, ty - 21, items[1]!), 'The item hit area reaches 21px above its centre.');
  },
};

export const SwitchFlushWithACollapsibleEdgeKeepsItsHitArea: Story = {
  render: () => (
    <div className="w-80" style={touch}>
      <Collapsible defaultExpanded>
        <Collapsible.Trigger>Settings</Collapsible.Trigger>
        <Collapsible.Content>
          <div className="flex justify-end">
            <Switch aria-label="Flush switch" />
          </div>
        </Collapsible.Content>
      </Collapsible>
    </div>
  ),
  play: async ({ canvas }) => {
    const control = canvas.getByRole('switch');
    const rect = control.getBoundingClientRect();
    const cy = rect.top + rect.height / 2;
    assert(
      hit(rect.right + 3, cy, control),
      'The inline overshoot of the hit area is not clipped by the panel.',
    );
  },
};
