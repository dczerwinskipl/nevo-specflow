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

/** Finds the specific "Standard · high" `menuitemradio` by its own label line, not the full
 * accessible name (which also includes that model's "available efforts" description — identical
 * on every one of its effort rows, so matching on it alone would not disambiguate low vs. high). */
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

/** Selecting a model+effort fires `onChange` with that exact pair, and the trigger's own label
 * updates to reflect it — the behavior `SelectModelEffort` used to prove at the screen level. */
export const SelectModelEffort: Story = {
  play: async ({ canvasElement }) => {
    handleChange.mockClear();
    const menu = await openModelMenu(canvasElement, 'Wybierz model');
    await userEvent.click(modelOptionByLabel(menu, 'Standard · high'));
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
    await waitFor(() => expect(handleChange).toHaveBeenCalledOnce());
    await expect(handleChange).toHaveBeenCalledWith('mock-standard', 'high');
  },
};

/** The Menu's richer per-item presentation (item 3): each effort row of a multi-effort model also
 * shows a description line listing every effort that model supports; a single-effort model does
 * not. The behavior `ModelMenuShowsAvailableEfforts` used to prove at the screen level. */
export const ModelMenuShowsAvailableEfforts: Story = {
  play: async ({ canvasElement }) => {
    const menu = await openModelMenu(canvasElement, 'Wybierz model');
    // `waitFor` (not a bare assertion) absorbs the Menu's own open fade-in transition — right
    // after it appears in the DOM its content is still mid-animation (`opacity: 0` on
    // `MenuContent` itself), so an immediate `toBeVisible()` would be a false negative, not a
    // real regression.
    await waitFor(async () => {
      const high = modelOptionByLabel(menu, 'Standard · high');
      await expect(within(high).getByText('Dostępne poziomy wysiłku: low, high')).toBeVisible();
    });
    const fast = modelOptionByLabel(menu, 'Fast');
    await expect(within(fast).queryByText(/Dostępne poziomy wysiłku/)).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
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
 * selected model/effort as visible truncating text next to its icon — never collapses to an
 * icon-only button (owner audit, round two: a real user could not find this picker at all when it
 * did, and reference screenshots of ChatGPT/Codex's own compact composer toolbar confirm a short
 * text label next to the icon is the expected pattern, not an unlabeled glyph). */
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
