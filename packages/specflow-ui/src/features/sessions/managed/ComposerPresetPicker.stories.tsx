import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { ComposerModePicker } from './ComposerPresetPicker';
import { providerFixture } from './managedSession.stories-support';
import { runtimeWorkModes, type WorkModeOption } from './workModes';

/**
 * Component-level stories for `ComposerModePicker`: the composer's "Tryb pracy" picker. Mounts
 * just the picker — no `AppShell`/`AppWorkspace`/`ManagedSession` screen around it — over a
 * provider's own Runtime catalogue (`runtimeWorkModes(provider)`) and a controlled
 * `value`/`onChange` pair, the same shape `ModelEffortPicker.stories.tsx` uses.
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
  options: WorkModeOption[];
  initialValue?: string;
  disabled?: boolean;
  compact?: boolean;
  onChange: (modeId: string) => void;
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
const claudeModes = runtimeWorkModes(providerFixture('claude-code'));

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
  args: { options: claudeModes, onChange: handleChange },
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

const rowLabels = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitemradio')
    .map((item) => item.textContent);

/** Baseline: the placeholder trigger when no work mode is selected yet. */
export const Placeholder: Story = {};

/** Claude Code's own catalogue, in its order and under its own titles; picking a mode closes the
 * menu and reports the opaque catalogue id. Ready modes carry no description line. */
export const ClaudeCatalogue: Story = {
  play: async ({ canvasElement }) => {
    handleChange.mockClear();
    const menu = await openModeMenu(canvasElement, 'Wybierz tryb pracy');
    await expect(rowLabels(menu)).toEqual([
      'Plan',
      'Accept edits',
      'Manual',
      expect.stringMatching(/^Don't ask/),
    ]);
    const plan = within(menu).getByRole('menuitemradio', { name: 'Plan' });
    await expect(plan.textContent).toBe('Plan');
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'Accept edits' }));
    await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());
    await expect(handleChange).toHaveBeenCalledOnce();
    await expect(handleChange).toHaveBeenCalledWith('acceptEdits');
    const trigger = within(canvasElement).getByRole('button', { name: 'Accept edits' });
    await expect(trigger.id).toBe('managed-intent');
  },
};

/** An unavailable mode is listed, disabled, with the catalogue's own reason as its second line. */
export const UnavailableModeShowsReason: Story = {
  play: async ({ canvasElement }) => {
    handleChange.mockClear();
    const menu = await openModeMenu(canvasElement, 'Wybierz tryb pracy');
    const dontAsk = within(menu)
      .getAllByRole('menuitemradio')
      .find((item) => item.textContent?.startsWith("Don't ask"))!;
    await expect(dontAsk).toHaveAttribute('aria-disabled', 'true');
    // `waitFor`: the menu's open animation starts from opacity 0.
    await waitFor(() =>
      expect(
        within(dontAsk).getByText('The installed Claude could not initialize this native mode.'),
      ).toBeVisible(),
    );
    await userEvent.keyboard('{Escape}');
    await expect(handleChange).not.toHaveBeenCalled();
  },
};

/** A Cursor-like provider speaks its own vocabulary (Ask/Plan/Agent); a mode the actor is not
 * authorized for is disabled with the generic "unavailable" wording (no catalogue reason). */
export const CursorLikeCatalogue: Story = {
  args: { options: runtimeWorkModes(providerFixture('cursor')), initialValue: 'ask' },
  play: async ({ canvasElement }) => {
    const menu = await openModeMenu(canvasElement, 'Ask');
    await expect(rowLabels(menu)).toEqual(['Ask', 'Plan', 'AgentNiedostępny']);
    await expect(within(menu).getByRole('menuitemradio', { name: 'Ask' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.keyboard('{Escape}');
  },
};

/** The picker renders nothing at all when the provider's catalogue lists no work modes — the
 * gating lives entirely inside `ComposerModePicker`, not split with its caller. */
export const NoModes: Story = {
  args: { options: runtimeWorkModes(providerFixture('without-modes')) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('#managed-intent')).toBeNull();
    await expect(canvasElement.querySelector('button')).toBeNull();
  },
};

/** The narrow/mobile presentation (`compact`): a text trigger with no icon, capped at 9rem and
 * truncated, with the full label in `title` — see `ComposerModePicker`'s own doc comment. */
export const CompactTrigger: Story = {
  args: {
    compact: true,
    options: [{ id: 'long', title: 'A provider mode with a deliberately long own title' }],
    initialValue: 'long',
  },
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLButtonElement>('#managed-intent');
    await expect(trigger).not.toBeNull();
    await expect(trigger?.getAttribute('title')).toBe(
      'A provider mode with a deliberately long own title',
    );
    await expect(trigger!.getBoundingClientRect().width).toBeLessThanOrEqual(144);
  },
};
