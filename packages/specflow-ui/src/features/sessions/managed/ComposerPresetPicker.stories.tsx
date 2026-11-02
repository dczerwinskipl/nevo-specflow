import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { ComposerModePicker, type ComposerModeValue } from './ComposerPresetPicker';
import { demoComposerOptions, type ComposerOptions } from './composerOptions';

/**
 * Component-level stories for `ComposerModePicker`: the composer's "Tryb pracy" picker. Mounts
 * just the picker — no `AppShell`/`AppWorkspace`/`ManagedSession` screen around it — with a plain
 * `ComposerOptions` catalogue and a controlled `value`/`onChange` pair, the same shape
 * `ModelEffortPicker.stories.tsx` already uses for its own sibling picker.
 */

/** Controlled harness: owns `value` itself and forwards every change through a spy, so a story
 * can both assert `onChange`'s exact arguments and watch the picker's own trigger label update. */
function ComposerModePickerHarness({
  options,
  initialValue,
  disabled,
  compact,
  onChange,
}: {
  options: ComposerOptions;
  initialValue?: ComposerModeValue;
  disabled?: boolean;
  compact?: boolean;
  onChange: (value: ComposerModeValue) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="p-4">
      <ComposerModePicker
        options={options}
        value={value}
        disabled={disabled}
        compact={compact}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </div>
  );
}

const handleChange = fn();

const meta = {
  title: 'SpecFlow/Components/ComposerModePicker',
  component: ComposerModePickerHarness,
  decorators: [
    (Story) => (
      <StoryLocalization locale="pl">
        <Story />
      </StoryLocalization>
    ),
  ],
  args: { options: demoComposerOptions('claude-code'), onChange: handleChange },
} satisfies Meta<typeof ComposerModePickerHarness>;
export default meta;
type Story = StoryObj<typeof meta>;

async function openModeMenu(canvasElement: HTMLElement, triggerName: string | RegExp) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: triggerName }));

  return waitFor(() => {
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    if (!menu) {
      throw new Error('The mode menu should open.');
    }

    return menu;
  });
}

function modeOptionByLabel(menu: HTMLElement, label: string) {
  const option = within(menu)
    .getAllByRole('menuitemradio')
    .find((item) => within(item).queryByText(label));
  if (!option) {
    throw new Error(`Option "${label}" should exist.`);
  }

  return option;
}

/** Baseline: the placeholder trigger when no work mode is selected yet. */
export const Placeholder: Story = {};

/** Picking "Ask" (no operation policies at all, demo catalogue) closes the menu immediately and
 * fires a complete value with no `operationPolicyId` — there is nothing to reveal a second
 * section for. */
export const SelectModeWithoutPolicy: Story = {
  play: async ({ canvasElement }) => {
    handleChange.mockClear();
    const menu = await openModeMenu(canvasElement, 'Wybierz tryb pracy');
    await userEvent.click(modeOptionByLabel(menu, 'Zapytaj'));
    await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
    await expect(handleChange).toHaveBeenCalledOnce();
    await expect(handleChange).toHaveBeenCalledWith({
      intent: 'ask',
      operationPolicyId: undefined,
    });
    const trigger = within(canvasElement).getByRole('button', { name: 'Zapytaj' });
    await expect(trigger.id).toBe('managed-intent');
  },
};

/** Picking "Agent" (two operation policies, demo catalogue) keeps the menu open and reveals
 * "Zatwierdzanie operacji" instead of closing — defaulting to the preset's first policy — and
 * picking the policy itself then closes and fires the final combined value (owner audit, round
 * five: two sections in one popover, Antigravity reference). */
export const SelectModeRevealsApprovalSection: Story = {
  play: async ({ canvasElement }) => {
    handleChange.mockClear();
    const menu = await openModeMenu(canvasElement, 'Wybierz tryb pracy');
    await expect(within(menu).queryByText('Zatwierdzanie operacji')).not.toBeInTheDocument();
    await userEvent.click(modeOptionByLabel(menu, 'Agent'));
    await waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());
    await waitFor(() =>
      expect(handleChange).toHaveBeenCalledWith({
        intent: 'agent',
        operationPolicyId: 'askEachTime',
      }),
    );
    await waitFor(async () => {
      await expect(within(menu).getByText('Zatwierdzanie operacji')).toBeVisible();
      await expect(modeOptionByLabel(menu, 'Pytaj za każdym razem')).toBeVisible();
      await expect(modeOptionByLabel(menu, 'Automatyczne edycje')).toBeVisible();
    });
    await userEvent.click(modeOptionByLabel(menu, 'Automatyczne edycje'));
    await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
    await expect(handleChange).toHaveBeenLastCalledWith({
      intent: 'agent',
      operationPolicyId: 'acceptEdits',
    });
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Agent · Automatyczne edycje',
    });
    await expect(trigger).toBeVisible();
  },
};

/** Owner audit, round six: both sections show a description under every row now (not just
 * Approval-mode) — each Work-mode row explains what that mode does, each Approval-mode row's
 * fuller explanation moved out of its (now shortened) label into its own description line. Both
 * use the exact same `MenuRadioItem`, so the layout stays consistent by construction. */
export const BothSectionsShowDescriptions: Story = {
  play: async ({ canvasElement }) => {
    const menu = await openModeMenu(canvasElement, 'Wybierz tryb pracy');
    await waitFor(async () => {
      const agent = modeOptionByLabel(menu, 'Agent');
      await expect(within(agent).getByText('Samodzielnie wykonuje zadania')).toBeVisible();
    });
    const ask = modeOptionByLabel(menu, 'Zapytaj');
    await expect(within(ask).getByText('Odpowiada i analizuje bez edycji plików')).toBeVisible();
    await userEvent.click(modeOptionByLabel(menu, 'Agent'));
    await waitFor(async () => {
      const acceptEdits = modeOptionByLabel(menu, 'Automatyczne edycje');
      await expect(
        within(acceptEdits).getByText(
          'Odczyty i edycje plików w workspace bez potwierdzenia; inne operacje nadal pytają.',
        ),
      ).toBeVisible();
      const askEachTime = modeOptionByLabel(menu, 'Pytaj za każdym razem');
      await expect(
        within(askEachTime).getByText(
          'Każda operacja wymaga Twojego potwierdzenia przed wykonaniem.',
        ),
      ).toBeVisible();
    });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
  },
};

/** The picker renders nothing at all when the matched provider/catalogue has no presets — the
 * gating lives entirely inside `ComposerModePicker`, not split with its caller. */
export const NoPresets: Story = {
  args: { options: { presets: [], operationPoliciesByPreset: {} } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('#managed-intent')).toBeNull();
    await expect(canvasElement.querySelector('button')).toBeNull();
  },
};

/** The narrow/mobile presentation (`compact`): stays icon-only, unlike `ModelEffortPicker`'s own
 * compact trigger — see `ComposerModePicker`'s own doc comment for why. */
export const CompactTrigger: Story = {
  args: {
    compact: true,
    initialValue: { intent: 'agent', operationPolicyId: 'acceptEdits' },
  },
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLButtonElement>('#managed-intent');
    await expect(trigger).not.toBeNull();
    await expect(trigger?.getAttribute('aria-label')).toBe('Agent · Automatyczne edycje');
  },
};
