import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { ModelEffortPicker, type ModelEffortValue } from './ModelEffortPicker';
import { providerFixture } from './managedSession.stories-support';

/**
 * Component-level stories for `ModelEffortPicker`: the composer's "Model · Effort" picker
 * (session-chat-v10 §"Model — następny Turn"), extracted out of `ManagedSession.tsx` as its own
 * self-contained unit. Mounts just the picker — no `AppShell`/`AppWorkspace`/`ManagedSession`
 * screen around it — with a plain `ProviderDescriptor` and a controlled `value`/`onChange` pair.
 *
 * Previously this behavior was only proven by `SelectModelEffort`, `ModelMenuShowsAvailableEfforts`
 * and `NoModelOverrideCapability` in `ManagedSession.interactions.stories.tsx`, each mounting the
 * *entire* `ManagedSession` screen just to reach one small toolbar element — the wrong level of
 * story for what they were actually testing (owner feedback). All three are removed now that this
 * file covers the same ground at the right level.
 */

/** Controlled harness: owns `value` itself and forwards every change through a spy, so a story
 * can both assert `onChange`'s exact arguments and watch the picker's own trigger label update. */
function ModelEffortPickerHarness({
  provider,
  initialValue,
  disabled,
  compact,
  onChange,
}: {
  provider: ProviderDescriptor | undefined;
  initialValue?: ModelEffortValue;
  disabled?: boolean;
  compact?: boolean;
  onChange: (modelId: string, effort?: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="p-4">
      <ModelEffortPicker
        provider={provider}
        value={value}
        disabled={disabled}
        compact={compact}
        onChange={(modelId, effort) => {
          setValue({ modelId, effort });
          onChange(modelId, effort);
        }}
      />
    </div>
  );
}

const handleChange = fn();

const meta = {
  title: 'SpecFlow/Components/ModelEffortPicker',
  component: ModelEffortPickerHarness,
  decorators: [
    (Story) => (
      <StoryLocalization locale="pl">
        <Story />
      </StoryLocalization>
    ),
  ],
  args: { provider: providerFixture(), onChange: handleChange },
} satisfies Meta<typeof ModelEffortPickerHarness>;
export default meta;
type Story = StoryObj<typeof meta>;

async function openModelMenu(canvasElement: HTMLElement, triggerName: string) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: triggerName }));

  return waitFor(() => {
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    if (!menu) {
      throw new Error('The model/effort menu should open.');
    }

    return menu;
  });
}

/** Finds the `menuitemradio` with this exact label, in either section (Model or Reasoning
 * effort) — the two sections never share a label, so an exact label match is unambiguous. */
function modelOptionByLabel(menu: HTMLElement, label: string) {
  const option = within(menu)
    .getAllByRole('menuitemradio')
    .find((item) => within(item).queryByText(label));
  if (!option) {
    throw new Error(`Option "${label}" should exist.`);
  }

  return option;
}

/** Baseline: the placeholder trigger when no model/effort is selected yet. */
export const Placeholder: Story = {};

/** Picking a model with more than one effort (owner audit, round five: two sections in one
 * popover, Antigravity reference) keeps the menu open and reveals "Reasoning effort" instead of
 * closing — picking the effort itself then closes and fires the final combined `onChange`. The
 * behavior `SelectModelEffort` used to prove at the screen level, for the old single flattened
 * list, now proven for the two-section popover instead. */
export const SelectModelEffort: Story = {
  play: async ({ canvasElement }) => {
    handleChange.mockClear();
    const menu = await openModelMenu(canvasElement, 'Wybierz model');
    await userEvent.click(modelOptionByLabel(menu, 'Standard'));
    // Picking "Standard" (2 efforts) must NOT close the menu — it reveals "Poziom wysiłku" below
    // instead, defaulting to the model's first effort.
    await waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());
    await waitFor(() => expect(handleChange).toHaveBeenCalledWith('mock-standard', 'low'));
    await userEvent.click(modelOptionByLabel(menu, 'high'));
    await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
    // Not `findByRole('button', { name: 'Standard · high' })` (owner audit, round four: the
    // trigger's label is now two separate nodes — the model title text node, then the effort's
    // OWN nested `<span>`, for its distinct lighter weight — and the accessible-name algorithm
    // inserts its own inter-element separator between them, which does not reliably collapse back
    // to the single-space `textContent` string an exact-name role query expects; `textContent`
    // itself is unambiguous and is what every other assertion in this file already checks for a
    // rich, multi-node label, see `CompactTrigger*`). The query targets the known `id` instead.
    const trigger = within(canvasElement).getByRole('button', { name: /Standard/ });
    await expect(trigger).toBeVisible();
    await expect(trigger.id).toBe('managed-model');
    await expect(trigger.textContent).toBe('Standard · high');
    await expect(handleChange).toHaveBeenCalledTimes(2);
    await expect(handleChange).toHaveBeenLastCalledWith('mock-standard', 'high');
  },
};

/** The popover's two-section shape (owner audit, round five, Antigravity reference): a
 * multi-effort model reveals its own "Reasoning effort" section with one row per effort; a
 * single-/no-effort model never reveals that section at all. Supersedes the old
 * `ModelMenuShowsAvailableEfforts` (per-row "available efforts" description), removed now that
 * effort is its own visible section instead of a second description line. */
export const ModelMenuRevealsEffortSection: Story = {
  play: async ({ canvasElement }) => {
    const menu = await openModelMenu(canvasElement, 'Wybierz model');
    await expect(within(menu).queryByText('Poziom wysiłku')).not.toBeInTheDocument();
    await userEvent.click(modelOptionByLabel(menu, 'Standard'));
    // `waitFor` (not a bare assertion) absorbs the Menu's own open fade-in transition — right
    // after the effort section appears it is still mid-animation, so an immediate assertion
    // would be a false negative, not a real regression.
    await waitFor(async () => {
      await expect(within(menu).getByText('Poziom wysiłku')).toBeVisible();
      await expect(modelOptionByLabel(menu, 'low')).toBeVisible();
      await expect(modelOptionByLabel(menu, 'high')).toBeVisible();
    });
    await userEvent.click(modelOptionByLabel(menu, 'Fast'));
    await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
  },
};

/** The picker renders nothing at all when the matched provider has no `modelOverride` capability
 * — the gating lives entirely inside `ModelEffortPicker` now, not split with its caller. The
 * behavior `NoModelOverrideCapability` used to prove at the screen level. */
export const NoModelOverrideCapability: Story = {
  args: {
    provider: {
      ...providerFixture(),
      capabilities: { ...providerFixture().capabilities, modelOverride: false },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('#managed-model')).toBeNull();
    await expect(canvasElement.querySelector('button')).toBeNull();
  },
};

/** The narrow/mobile presentation (`compact`): the trigger narrows, but keeps showing the
 * selected model/effort as visible truncating text — never collapses to an icon-only button
 * (owner audit, round two: a real user could not find this picker at all when it did). */
export const CompactTrigger: Story = {
  args: {
    compact: true,
    initialValue: { modelId: 'mock-standard', effort: 'low' },
  },
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLButtonElement>('#managed-model');
    await expect(trigger).not.toBeNull();
    await expect(trigger?.textContent).toBe('Standard · low');
  },
};

/**
 * Owner audit, round three: this app's own `ProviderDescriptor.models[].title` is not guaranteed
 * to be a short, brand-dropped form the way the reference screenshots' in-app labels were (e.g.
 * "Claude Sonnet 5", not "Sonnet 5") — proves the compact trigger degrades a realistically long
 * real title to readable, ellipsis-truncated text instead of overflowing the toolbar or falling
 * back to an unlabeled icon, not just the short "Standard"/"Fast" placeholders this file's own
 * fixture otherwise uses everywhere else.
 */
export const CompactTriggerLongModelName: Story = {
  args: {
    compact: true,
    provider: {
      ...providerFixture(),
      models: [
        { modelId: 'mock-long', title: 'Claude Sonnet 5 Extended Thinking', efforts: ['high'] },
      ],
    },
    initialValue: { modelId: 'mock-long', effort: 'high' },
  },
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLButtonElement>('#managed-model');
    await expect(trigger).not.toBeNull();
    // The full label is still the trigger's accessible name/title (never lost) — only its
    // *rendered* text is visually clipped by `max-w`/`truncate`, confirmed below by the label
    // element's own scrollWidth exceeding its clientWidth (an ellipsis is a visual-only effect;
    // `textContent` always reports the untruncated string).
    await expect(trigger?.textContent).toBe('Claude Sonnet 5 Extended Thinking · high');
    // The label is `Button`'s own `data-design-slot="label"` span — not simply the last `span`
    // child: the effort now renders as its OWN nested span inside that label span (for its
    // lighter weight/secondary color), so a bare last-`span` lookup would instead match either
    // that nested effort span or the trailing chevron's wrapping span, depending on which came
    // last in document order.
    const label = trigger?.querySelector('[data-design-slot="label"]');
    await waitFor(() => {
      if (!label || label.scrollWidth <= label.clientWidth) {
        throw new Error('The long model label should be visually truncated, not overflow.');
      }
    });
    // The cap is an inline `style.maxWidth` (see `ModelEffortPicker.tsx`'s own doc comment: a
    // `max-w-*` className has no guaranteed precedence here over `truncate`'s own `max-w-full`,
    // since `cn` is plain `clsx`, not `tailwind-merge`) — 192px for a compact trigger.
    await expect(trigger?.getBoundingClientRect().width).toBeLessThanOrEqual(192);
  },
};
