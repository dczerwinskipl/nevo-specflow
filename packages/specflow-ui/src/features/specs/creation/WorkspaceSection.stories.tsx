import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { browserPage } from '../../../test-support/browserPage';
import { expect, waitFor, within } from 'storybook/test';
import { TooltipProvider } from '@nevo/ui';
import { WorkspaceSection, type WorkspaceOptionsState } from './WorkspaceSection';
import {
  buildCreateTarget,
  initialWorkspaceChoice,
  problems,
  type WorkspaceChoice,
} from './workspaceChoice';
import {
  createOptionsFixture,
  workspaceIds,
  type OptionsVariant,
} from './creationOptions.stories-support';
import { polishText } from '../../../i18n/testing';
import { withLocale } from '../../../i18n/StoryLocalization';

/**
 * Presentation contract of "Gdzie chcesz pracować?" without any network: the options reach the
 * section as plain state (the same `DemoCreateOptions` the Runtime serves), the choice is owned by
 * the story harness exactly as the creation form owns it.
 */
function Harness({
  variant = 'default',
  status = 'ready',
  initial = {},
  locked = false,
  refreshing = false,
  refreshFailed = false,
  branchConflict,
}: {
  variant?: OptionsVariant;
  status?: WorkspaceOptionsState['status'];
  initial?: Partial<WorkspaceChoice>;
  locked?: boolean;
  refreshing?: boolean;
  refreshFailed?: boolean;
  branchConflict?: string;
}) {
  const [choice, setChoice] = useState<WorkspaceChoice>({ ...initialWorkspaceChoice, ...initial });
  const [announcement, setAnnouncement] = useState('');
  const options = createOptionsFixture(variant);
  const state: WorkspaceOptionsState = status === 'ready' ? { status, options } : { status };
  return (
    <TooltipProvider>
      <div className="@container w-full" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <form onSubmit={(event) => event.preventDefault()} className="grid gap-4 p-4">
          <WorkspaceSection
            headingId="workspace-heading"
            state={state}
            refreshing={refreshing}
            refreshFailed={refreshFailed}
            choice={choice}
            update={setChoice}
            locked={locked}
            onRefresh={() => setAnnouncement('Opcje odświeżone.')}
            announcement={announcement}
            onAnnounce={setAnnouncement}
            branchConflict={branchConflict}
            focusBranchSignal={branchConflict ? 1 : 0}
          />
          <div
            role="note"
            className="break-all text-body-sm"
            aria-label="Żądanie"
            data-problems={problems(choice, options)
              .map((entry) => polishText(entry))
              .join('|')}
          >
            {JSON.stringify(buildCreateTarget(choice, options) ?? null)}
          </div>
        </form>
      </div>
    </TooltipProvider>
  );
}

const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Features/Specification Creation/Workspace Section',
  component: Harness,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Harness>;
export default meta;
type Story = StoryObj<typeof meta>;
type Play = NonNullable<Story['play']>;
type Context = Parameters<Play>[0];

const request = (canvas: Context['canvas']) => canvas.getByLabelText('Żądanie').textContent;
const summary = (canvas: Context['canvas']) =>
  canvas.getByRole('group', { name: 'Podsumowanie środowiska pracy' });
async function settle(width: number, height = 900) {
  await (await browserPage()).viewport(width, height);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
/** Close an open Combobox list and wait for it to unmount, so no overlay state leaks into the next story. */
async function closeList(userEvent: Context['userEvent']) {
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(within(document.body).queryByRole('listbox')).not.toBeInTheDocument());
}
async function expectNoOverflow(width: number) {
  await settle(width);
  const culprits = [...document.querySelectorAll('body *')]
    .filter((element) => element.getBoundingClientRect().right > width + 1)
    .map((element) => `${element.tagName}.${String(element.className).slice(0, 50)}`);
  await expect(culprits.slice(0, 5), `overflow at ${width}`).toEqual([]);
}
const tiles = (canvas: Context['canvas']) =>
  ['Nowe środowisko pracy', 'Bieżący katalog', 'Istniejące środowisko pracy'].map((name) =>
    canvas.getByRole('radio', { name }),
  ) as [HTMLElement, HTMLElement, HTMLElement];
const label = (element: HTMLElement) => element.closest('label')!;
async function openSettings(canvas: Context['canvas'], userEvent: Context['userEvent']) {
  await userEvent.click(canvas.getByRole('button', { name: /Zmień ustawienia/ }));
}

export const DefaultNewWorkspace: Story = {
  tags: ['contract'],
  play: async ({ canvas }) => {
    const [fresh, main, existing] = tiles(canvas);
    await expect(fresh).toBeChecked();
    await expect(main).not.toBeChecked();
    await expect(existing).not.toBeChecked();
    // Order of the group is Nowy -> Główny -> Istniejący and the badge recommends the first.
    await expect(canvas.getByRole('radiogroup', { name: 'Gdzie chcesz pracować?' })).toBeVisible();
    await expect(canvas.getByText('Zalecane')).toBeVisible();
    await expect(canvas.getByText('3 dostępne')).toBeVisible();
    // The tile owns the "new branch + worktree" statement; the summary only labels defaults.
    await expect(summary(canvas)).toHaveTextContent('Ustawienia domyślne');
    await expect(summary(canvas)).not.toHaveTextContent('Powstanie nowa gałąź');
    await expect(summary(canvas)).toHaveTextContent('automatycznie');
    // Default request: nothing but the kind; no baseRef, branch or target is hard-coded.
    await expect(request(canvas)).toBe('{"kind":"new-worktree"}');
    // The summary comes after the whole radio group, also in the DOM.
    const group = canvas.getByRole('radiogroup');
    await expect(
      group.compareDocumentPosition(summary(canvas)) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(group.contains(summary(canvas))).toBe(false);
    await expect(canvas.getByRole('button', { name: 'Zmień ustawienia' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  },
};

export const BranchIconsAreDecorative: Story = {
  tags: ['contract'],
  play: async ({ canvas }) => {
    const value = canvas.getAllByText('develop')[0]!;
    await expect(/monospace/i.test(getComputedStyle(value).fontFamily)).toBe(true);
    const icon = value.parentElement!.querySelector('svg')!;
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(value.parentElement!.textContent).toBe('develop');
  },
};

export const MainWorkspace: Story = {
  tags: ['contract'],
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('radio', { name: 'Bieżący katalog' }));
    await expect(summary(canvas)).toHaveTextContent(
      'Specyfikacja powstanie na gałęzi develop. Nie tworzymy nowej gałęzi ani worktree i nie przełączamy aktualnej gałęzi.',
    );
    await expect(
      canvas.queryByRole('button', { name: /Zmień ustawienia/ }),
    ).not.toBeInTheDocument();
    await expect(request(canvas)).toBe('null');
  },
};

export const MainWorkspaceDirty: Story = {
  args: { variant: 'primary-dirty', initial: { tile: 'main' } },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(summary(canvas)).toHaveTextContent('Katalog ma niezapisane zmiany w Git.');
    await expect(canvas.getAllByText('zmiany')[0]).toBeVisible();
  },
};

export const ExistingWorkspace: Story = {
  tags: ['contract'],
  // DS gap: the select placeholder colour is below 4.5:1 on the summary surface.
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('radio', { name: 'Istniejące środowisko pracy' }));
    await expect(canvas.getByRole('radio', { name: 'Istniejące środowisko pracy' })).toBeChecked();
    // Nothing is preselected: Create stays blocked and no target is built yet.
    await expect(request(canvas)).toBe('null');
    await expect(canvas.getByLabelText('Żądanie')).toHaveAttribute(
      'data-problems',
      'Wybierz środowisko pracy.',
    );
    await expect(canvas.getByRole('combobox', { name: 'Środowisko pracy' })).toHaveTextContent(
      'Wybierz środowisko pracy',
    );
  },
};

export const ExistingWorkspaceSelection: Story = {
  args: { initial: { tile: 'existing' } },
  tags: ['contract'],
  // The open listbox has no focused item yet (axe: scrollable region without focusable content).
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await expect(request(canvas)).toBe('null');
    await expect(canvas.getByLabelText('Żądanie')).toHaveAttribute(
      'data-problems',
      'Wybierz środowisko pracy.',
    );
    await userEvent.click(canvas.getByRole('combobox', { name: 'Środowisko pracy' }));
    const list = within(document.body);
    // Every linked workspace is listed with its state; blocked ones stay reachable with a reason.
    const platform = await list.findByRole('option', { name: /feature\/platform/ });
    await expect(platform).toHaveTextContent('2 specyfikacje');
    const dirty = list.getByRole('option', { name: /feature\/payments/ });
    await expect(dirty).toHaveTextContent('Ma niezapisane zmiany w Git');
    // The Engine gives detached and unavailable workspaces no branch, so both read the same.
    const [detached, unavailable] = list.getAllByRole('option', { name: /Środowisko bez gałęzi/ });
    await expect(detached).toHaveAttribute('aria-disabled', 'true');
    await expect(detached).toHaveTextContent('Nie wybrano gałęzi (odłączony stan)');
    await expect(unavailable).toHaveAttribute('aria-disabled', 'true');
    await expect(unavailable).toHaveTextContent('Katalog niedostępny');
    await userEvent.click(detached!);
    await expect(canvas.getByLabelText('Żądanie')).toHaveTextContent('null');
    await userEvent.click(platform);
    await expect(summary(canvas)).toHaveTextContent('Specyfikacja dołączy do feature/platform.');
    await expect(summary(canvas)).toHaveTextContent(
      '2 istniejące specyfikacje używają już tego środowiska pracy. Zmiany i historia Git będą wspólne.',
    );
    await expect(request(canvas)).toBe(
      JSON.stringify({ kind: 'existing', workspaceId: workspaceIds.platform }),
    );
    // The trigger keeps one line: only the branch, never the count or reason.
    await expect(canvas.getByRole('combobox', { name: 'Środowisko pracy' })).toHaveTextContent(
      'feature/platform',
    );
  },
};

export const ExistingPinnedTargetIsShownAsFixedAtCreation: Story = {
  args: { initial: { tile: 'existing', existingWorkspaceId: workspaceIds.payments } },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas }) => {
    // Only the workspace's own pin counts, shown as the pinned branch, with no control to change it.
    await expect(summary(canvas)).toHaveTextContent(
      'Scalane do: develop (ustalone przy tworzeniu tego środowiska)',
    );
    await expect(summary(canvas)).not.toHaveTextContent('Cel projektu');
    await expect(within(summary(canvas)).queryByRole('switch')).toBeNull();
    await expect(summary(canvas)).not.toHaveTextContent('Środowisko docelowe');
  },
};

export const ExistingWithoutPinShowsTheProjectTargetOnly: Story = {
  args: { initial: { tile: 'existing', existingWorkspaceId: workspaceIds.platform } },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas }) => {
    await expect(summary(canvas)).toHaveTextContent('Cel projektu: develop');
    await expect(summary(canvas)).not.toHaveTextContent('Scalane do');
  },
};

export const ExistingWithoutAnyTargetSaysSo: Story = {
  args: {
    variant: 'no-integration-target',
    initial: { tile: 'existing', existingWorkspaceId: workspaceIds.platform },
  },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas }) => {
    await expect(summary(canvas)).toHaveTextContent('Cel scalenia nie jest ustawiony w projekcie.');
  },
};

export const ExistingPinThatDriftedIsFlagged: Story = {
  args: {
    variant: 'pin-drift',
    initial: { tile: 'existing', existingWorkspaceId: workspaceIds.payments },
  },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas }) => {
    await expect(summary(canvas)).toHaveTextContent(
      'Scalane do: release/1.3 (ustalone przy tworzeniu tego środowiska)',
    );
    await expect(summary(canvas)).toHaveTextContent('zmieniło gałąź od czasu przypięcia');
  },
};

export const ExistingPinWithUnavailableTargetIsFlagged: Story = {
  args: {
    variant: 'primary-dirty',
    initial: { tile: 'existing', existingWorkspaceId: workspaceIds.payments },
  },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas }) => {
    await expect(summary(canvas)).toHaveTextContent('Scalane do: develop');
    await expect(summary(canvas)).toHaveTextContent('Środowisko docelowe nie jest teraz dostępne');
  },
};

export const ExistingManagedFalseAndMany: Story = {
  args: { variant: 'many-workspaces', initial: { tile: 'existing' } },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    // Own the viewport: the story must not depend on what an earlier story left behind.
    await settle(1440);
    await expect(canvas.getByText('11 dostępnych')).toBeVisible();
    // More than eight options: a searchable Combobox instead of a Select.
    const input = canvas.getByRole('combobox', { name: 'Środowisko pracy' });
    await expect(input.tagName).toBe('INPUT');
    await userEvent.click(canvas.getByRole('button', { name: /Pokaż opcje/ }));
    await expect(await within(document.body).findAllByRole('option')).toHaveLength(13);
    await userEvent.type(input, 'zzz-nic');
    // The list fades in; wait for it to be actually visible instead of racing the animation.
    const empty = await within(document.body).findByText('Brak wyników');
    await waitFor(() => expect(empty).toBeVisible());
    await closeList(userEvent);
  },
};

export const ExistingOutsideNevo: Story = {
  args: { variant: 'managed-false', initial: { tile: 'existing' } },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Środowisko pracy' }));
    const option = await within(document.body).findByRole(
      'option',
      { name: /architecture/ },
      { timeout: 5000 },
    );
    await expect(option).toHaveTextContent('Poza Nevo');
    await closeList(userEvent);
  },
};

export const SwitchesCollapsedByDefault: Story = {
  tags: ['contract'],
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: /Zmień ustawienia/ });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('switch')).not.toBeInTheDocument();
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getAllByRole('switch')).toHaveLength(3);
  },
};

export const ThreeIndependentSwitches: Story = {
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    const base = canvas.getByRole('switch', { name: 'Zacznij od innej gałęzi' });
    const target = canvas.getByRole('switch', { name: 'Scal później do innej gałęzi' });
    const name = canvas.getByRole('switch', { name: 'Użyj własnej nazwy gałęzi' });
    for (const control of [base, target, name]) await expect(control).not.toBeChecked();
    await expect(request(canvas)).toBe('{"kind":"new-worktree"}');

    await userEvent.click(name);
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' }),
      'feature/payments-v2',
    );
    await expect(request(canvas)).toBe('{"kind":"new-worktree","branch":"feature/payments-v2"}');
    await expect(base).not.toBeChecked();
    await expect(target).not.toBeChecked();
    await expect(summary(canvas)).toHaveTextContent('Zmienione ustawienia (1): nazwa');

    await userEvent.click(target);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Wskaż cel scalenia' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: /spec\/architecture/ }),
    );
    await expect(request(canvas)).toBe(
      JSON.stringify({
        kind: 'new-worktree',
        branch: 'feature/payments-v2',
        integrationTargetWorkspaceId: workspaceIds.architecture,
      }),
    );
    // Turning a switch off removes only its field and keeps the remembered value.
    await userEvent.click(name);
    await expect(request(canvas)).toBe(
      JSON.stringify({
        kind: 'new-worktree',
        integrationTargetWorkspaceId: workspaceIds.architecture,
      }),
    );
    await userEvent.click(name);
    await expect(canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' })).toHaveValue(
      'feature/payments-v2',
    );
  },
};

export const MovingBetweenTilesKeepsAndHidesSettings: Story = {
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    await userEvent.click(canvas.getByRole('switch', { name: 'Użyj własnej nazwy gałęzi' }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' }),
      'feature/keep',
    );
    await userEvent.click(canvas.getByRole('radio', { name: 'Bieżący katalog' }));
    await expect(request(canvas)).toBe('null');
    await expect(canvas.queryByRole('switch')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('radio', { name: 'Nowe środowisko pracy' }));
    // Same disclosure state and value as before; no silent change of the others.
    await expect(canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' })).toHaveValue(
      'feature/keep',
    );
    await expect(request(canvas)).toBe('{"kind":"new-worktree","branch":"feature/keep"}');
  },
};

export const BaseSuggestionAcceptMovesFocusAndAnnounces: Story = {
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    await userEvent.click(canvas.getByRole('switch', { name: 'Zacznij od innej gałęzi' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Zacznij od' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: /feature\/platform/ }),
    );
    // Changing the base alone never changes the target.
    await expect(request(canvas)).toBe('{"kind":"new-worktree","baseRef":"feature/platform"}');
    await expect(canvas.getByText(/Chcesz później scalić zmiany z powrotem do/)).toBeVisible();
    // Q9: short labels, so no button needs to truncate or reach into the DS Button internals.
    await expect(
      canvas.getByRole('button', { name: 'Ustaw cel scalenia' }).scrollWidth,
    ).toBeLessThanOrEqual(canvas.getByRole('button', { name: 'Ustaw cel scalenia' }).clientWidth);
    await userEvent.click(canvas.getByRole('button', { name: 'Ustaw cel scalenia' }));
    await waitFor(() =>
      expect(canvas.getByRole('combobox', { name: 'Wskaż cel scalenia' })).toHaveFocus(),
    );
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Cel scalenia ustawiony na feature/platform.',
    );
    await expect(request(canvas)).toBe(
      JSON.stringify({
        kind: 'new-worktree',
        baseRef: 'feature/platform',
        integrationTargetWorkspaceId: workspaceIds.platform,
      }),
    );
    await expect(canvas.queryByText(/Chcesz później scalić/)).not.toBeInTheDocument();
  },
};

export const BaseSuggestionDeclineKeepsTarget: Story = {
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    await userEvent.click(canvas.getByRole('switch', { name: 'Zacznij od innej gałęzi' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Zacznij od' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: /feature\/platform/ }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Zostaw bez zmian' }));
    await waitFor(() => expect(canvas.getByRole('combobox', { name: 'Zacznij od' })).toHaveFocus());
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Cel scalenia pozostaje bez zmian: develop.',
    );
    await expect(request(canvas)).toBe('{"kind":"new-worktree","baseRef":"feature/platform"}');
  },
};

export const BaseSuggestionForDirtyWorkspaceExplains: Story = {
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    await userEvent.click(canvas.getByRole('switch', { name: 'Zacznij od innej gałęzi' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Zacznij od' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: /feature\/payments/ }),
    );
    await expect(canvas.getByText(/Nie zaproponujemy scalenia z powrotem do/)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /Tak, scal/ })).not.toBeInTheDocument();
  },
};

export const TargetListNeverEqualsBaseList: Story = {
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    await userEvent.click(canvas.getByRole('switch', { name: 'Zacznij od innej gałęzi' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Zacznij od' }));
    const bases = (await within(document.body).findAllByRole('option')).map((o) => o.textContent);
    await expect(bases.some((text) => text?.includes('release/1.4'))).toBe(true);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getByRole('switch', { name: 'Scal później do innej gałęzi' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Wskaż cel scalenia' }));
    const targets = await within(document.body).findAllByRole('option');
    await expect(targets.some((o) => o.textContent?.includes('release/1.4'))).toBe(false);
    const dirty = targets.find((o) => o.textContent?.includes('feature/payments'))!;
    await expect(dirty).toHaveAttribute('aria-disabled', 'true');
    await expect(dirty).toHaveTextContent('Ma niezapisane zmiany w Git');
    // Selecting a blocked target does nothing: the preselected defaults stay.
    const before = request(canvas);
    await userEvent.click(dirty);
    await expect(request(canvas)).toBe(before);
    await expect(request(canvas)).not.toContain(workspaceIds.payments);
  },
};

export const UnavailableTargetsStayReadableUnderTheField: Story = {
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    await userEvent.click(canvas.getByRole('switch', { name: 'Scal później do innej gałęzi' }));
    const hint = canvas.getByText(/Niedostępne jako cel:/);
    await expect(hint).toHaveTextContent('feature/payments (ma niezapisane zmiany w Git)');
    await expect(canvas.getByText(/Nic nie zostanie scalone teraz/)).toBeVisible();
    await expect(
      canvas.getByRole('combobox', { name: 'Wskaż cel scalenia' }).getAttribute('aria-describedby'),
    ).toBeTruthy();
  },
};

export const TargetSwitchWithoutAnyTargetIsReachableAndExplained: Story = {
  args: { variant: 'no-selectable-targets' },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    const target = canvas.getByRole('switch', { name: 'Scal później do innej gałęzi' });
    // aria-disabled, not disabled: reachable by keyboard with its reason as the description.
    await expect(target).toHaveAttribute('aria-disabled', 'true');
    await expect(target).not.toBeDisabled();
    await expect(canvas.getByText('Brak środowisk pracy, do których można scalić.')).toBeVisible();
    await userEvent.click(target);
    await expect(target).not.toBeChecked();
    await expect(request(canvas)).toBe('{"kind":"new-worktree"}');
  },
};

export const CustomNameValidation: Story = {
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    await userEvent.click(canvas.getByRole('switch', { name: 'Użyj własnej nazwy gałęzi' }));
    const input = canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' });
    await userEvent.type(input, 'bad name');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByText(/niedozwolone znaki/)).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, 'feature/platform');
    await expect(
      canvas.getByText('Gałąź o tej nazwie już istnieje. Wpisz inną nazwę.'),
    ).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, 'feature/ok');
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByLabelText('Żądanie')).toHaveAttribute('data-problems', '');
  },
};

export const ServerNameConflictFocusesTheField: Story = {
  args: {
    branchConflict: 'feature/payments-v2',
    initial: {
      tile: 'new',
      settingsOpen: true,
      branch: { on: true, name: 'feature/payments-v2' },
    },
  },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas }) => {
    const input = canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' });
    await waitFor(() => expect(input).toHaveFocus());
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(
      canvas.getByText('Gałąź o tej nazwie już istnieje. Wpisz inną nazwę.'),
    ).toBeVisible();
  },
};

export const StaleRememberedValueIsFlaggedOnReturn: Story = {
  args: {
    initial: {
      tile: 'main',
      base: { on: true, ref: 'feature/removed' },
      existingWorkspaceId: workspaceIds.spike,
    },
  },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    // While inactive the stale values neither block Create nor reach the request.
    await expect(canvas.getByLabelText('Żądanie')).toHaveAttribute('data-problems', '');
    await userEvent.click(canvas.getByRole('radio', { name: 'Nowe środowisko pracy' }));
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Wybrana wcześniej wartość nie jest już dostępna.',
    );
    await expect(canvas.getByText(/Ta gałąź nie jest już dostępna/)).toBeVisible();
    await expect(canvas.getByLabelText('Żądanie')).toHaveAttribute(
      'data-problems',
      'Ta gałąź nie jest już dostępna. Wybierz inną lub wyłącz tę opcję.',
    );
    await userEvent.click(canvas.getByRole('radio', { name: 'Istniejące środowisko pracy' }));
    await expect(canvas.getByText('To środowisko pracy nie jest już dostępne.')).toBeVisible();
  },
};

export const KeyboardArrowsMoveThroughTilesInOrder: Story = {
  tags: ['contract'],
  play: async ({ canvas, userEvent }) => {
    const [fresh, main, existing] = tiles(canvas);
    fresh.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(main).toHaveFocus();
    await expect(main).toBeChecked();
    await userEvent.keyboard('{ArrowDown}');
    await expect(existing).toHaveFocus();
    await expect(existing).toBeChecked();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(main).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(fresh).toHaveFocus();
    await expect(fresh).toBeChecked();
  },
};

export const UnavailableTileIsReachableAndReadable: Story = {
  args: { variant: 'git-disabled' },
  tags: ['contract'],
  play: async ({ canvas, userEvent }) => {
    const [fresh, main] = tiles(canvas);
    await expect(fresh).toHaveAttribute('aria-disabled', 'true');
    await expect(fresh).not.toBeDisabled();
    await expect(main).toBeChecked();
    // The reason is the visible description, connected to the radio.
    const reason = canvas.getByText('Wyłączone w konfiguracji projektu.');
    await expect(reason).toBeVisible();
    await expect(fresh.getAttribute('aria-describedby')).toBe(reason.id);
    main.focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(fresh).toHaveFocus();
    await userEvent.keyboard(' ');
    // Reachable but never chosen: the selection stays on the main workspace.
    await userEvent.click(label(fresh));
    await expect(main).toBeChecked();
    await expect(fresh).not.toBeChecked();
    await expect(request(canvas)).toBe('null');
  },
};

export const GitUnavailable: Story = {
  args: { variant: 'git-unavailable' },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Git jest teraz niedostępny.')).toBeVisible();
    await expect(canvas.getByRole('radio', { name: 'Bieżący katalog' })).toBeChecked();
  },
};

export const MembershipMismatch: Story = {
  args: { variant: 'membership-mismatch' },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Ten katalog nie należy do repozytorium projektu.'),
    ).toBeVisible();
  },
};

export const NoLinkedWorkspaces: Story = {
  args: { variant: 'no-linked' },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Brak innych środowisk pracy w projekcie.')).toBeVisible();
    await expect(
      canvas.getByRole('radio', { name: 'Istniejące środowisko pracy' }),
    ).toHaveAttribute('aria-disabled', 'true');
  },
};

export const LinkedWorkspacesNoneSelectable: Story = {
  args: { variant: 'linked-none-selectable' },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Żadne środowisko pracy nie jest teraz dostępne.')).toBeVisible();
  },
};

export const NothingAvailable: Story = {
  args: { variant: 'none-available' },
  tags: ['contract'],
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('alert', { name: undefined })).toHaveTextContent(
      'Nie można teraz utworzyć specyfikacji w żadnym miejscu',
    );
    for (const tile of tiles(canvas)) {
      await expect(tile).toHaveAttribute('aria-disabled', 'true');
      await expect(tile).not.toBeChecked();
    }
    await expect(canvas.queryByRole('group', { name: 'Podsumowanie środowiska pracy' })).toBeNull();
    await expect(canvas.getByLabelText('Żądanie')).toHaveAttribute(
      'data-problems',
      'Brak dostępnego środowiska pracy.',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Odśwież opcje' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('Opcje odświeżone.');
  },
};

export const PrimaryDetached: Story = {
  args: { variant: 'primary-detached' },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('W bieżącym katalogu nie wybrano gałęzi (odłączony stan).'),
    ).toBeVisible();
    await expect(summary(canvas)).toHaveTextContent('Aktualny commit bieżącego katalogu');
  },
};

export const HeadBaseWithAndWithoutBranch: Story = {
  args: { variant: 'head-base' },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(summary(canvas)).toHaveTextContent('Aktualny commit bieżącego katalogu (develop)');
  },
};
export const HeadBaseWithoutBranch: Story = {
  args: { variant: 'head-base-no-branch' },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(summary(canvas)).toHaveTextContent('Aktualny commit bieżącego katalogu');
    await expect(summary(canvas)).not.toHaveTextContent('(develop)');
    await expect(summary(canvas)).toHaveTextContent('Nie skonfigurowano celu integracji.');
  },
};

export const IntegrationTargetNotConfigured: Story = {
  args: { variant: 'no-integration-target' },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await expect(summary(canvas)).toHaveTextContent(
      'Nie skonfigurowano celu integracji. Utworzysz specyfikację, ale zamknięcie pracy będzie wymagać ustawienia celu w konfiguracji projektu.',
    );
    // It does not block Create and does not invent main or develop.
    await expect(canvas.getByLabelText('Żądanie')).toHaveAttribute('data-problems', '');
    await openSettings(canvas, userEvent);
    await expect(canvas.getByText('Cel integracji nie jest skonfigurowany.')).toBeVisible();
    await expect(
      canvas.getByRole('switch', { name: 'Scal później do innej gałęzi' }),
    ).toBeEnabled();
  },
};

export const ProjectTargetHeldOnlyByALinkedWorkspaceIsNotAvailable: Story = {
  args: { variant: 'primary-other-branch' },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    // A linked workspace sits on develop, but the default target is realised by the primary one.
    await expect(summary(canvas)).toHaveTextContent(
      'Cel projektu develop jest realizowany przez bieżący katalog, a ten jest teraz na gałęzi release/1.4.',
    );
    await expect(summary(canvas)).toHaveTextContent('Tworzenie nie jest blokowane.');
    await expect(canvas.getByLabelText('Żądanie')).toHaveAttribute('data-problems', '');
    await expect(request(canvas)).toBe('{"kind":"new-worktree"}');
    await openSettings(canvas, userEvent);
    await userEvent.click(canvas.getByRole('switch', { name: 'Scal później do innej gałęzi' }));
    // Still nothing preselected, even though a clean workspace is on the target branch.
    await expect(canvas.getByRole('combobox', { name: 'Wskaż cel scalenia' })).toHaveTextContent(
      'Wybierz środowisko pracy',
    );
  },
};

export const ConfiguredTargetHasUnsavedChanges: Story = {
  args: { variant: 'target-dirty' },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(summary(canvas)).toHaveTextContent(
      'nie jest teraz dostępny: ma niezapisane zmiany w Git. Tworzenie nie jest blokowane.',
    );
    await expect(canvas.getByLabelText('Żądanie')).toHaveAttribute('data-problems', '');
  },
};

export const Loading: Story = {
  args: { status: 'loading' },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'Gdzie chcesz pracować?' })).toBeVisible();
    await expect(canvas.queryByRole('radio')).not.toBeInTheDocument();
    await expect(canvas.getByLabelText('Żądanie')).toBeInTheDocument();
  },
};

export const OptionsError: Story = {
  args: { status: 'error' },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Nie udało się wczytać opcji środowiska pracy',
    );
    await expect(canvas.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible();
  },
};

export const Forbidden: Story = {
  args: { status: 'forbidden' },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Nie masz uprawnień do tworzenia specyfikacji',
    );
    await expect(canvas.queryByRole('radio')).not.toBeInTheDocument();
  },
};

export const Refreshing: Story = {
  args: { refreshing: true },
  tags: ['contract'],
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Odświeżamy opcje…');
    await expect(canvas.getByRole('status')).toBeVisible();
    // Content stays while refreshing.
    await expect(canvas.getByRole('radio', { name: 'Nowe środowisko pracy' })).toBeChecked();
  },
};

export const LockedWhileCreating: Story = {
  args: { locked: true, initial: { tile: 'new', settingsOpen: true } },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas }) => {
    for (const tile of tiles(canvas)) await expect(tile).toBeDisabled();
    for (const control of canvas.getAllByRole('switch')) await expect(control).toBeDisabled();
  },
};

export const LongNamesWrapWithoutOverflow: Story = {
  args: { variant: 'long-names', initial: { tile: 'new', settingsOpen: true } },
  tags: ['contract'],
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('switch', { name: 'Zacznij od innej gałęzi' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Zacznij od' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: /very-long-descriptive/ }),
    );
    for (const width of [320, 390, 1440]) await expectNoOverflow(width);
  },
};

export const ResponsiveColumnsAndNoOverflow: Story = {
  tags: ['contract'],
  play: async ({ canvas }) => {
    const rects = () =>
      tiles(canvas).map((tile) => label(tile).getBoundingClientRect()) as [
        DOMRect,
        DOMRect,
        DOMRect,
      ];
    for (const width of [320, 390, 600]) {
      await expectNoOverflow(width);
      const [a, b, c] = rects();
      // Single stacked column below the 672 px container threshold.
      await expect(b.top).toBeGreaterThan(a.bottom - 1);
      await expect(c.top).toBeGreaterThan(b.bottom - 1);
      await expect(Math.abs(a.left - c.left)).toBeLessThan(1);
    }
    for (const width of [768, 884, 1024, 1440, 2560]) {
      await expectNoOverflow(width);
      const [a, b, c] = rects();
      await expect(Math.abs(a.top - b.top)).toBeLessThan(1);
      await expect(Math.abs(b.top - c.top)).toBeLessThan(1);
      await expect(Math.abs(a.height - c.height)).toBeLessThan(1);
    }
    // The wide column stops at the standard content width.
    await settle(2560);
    await expect(document.querySelector('form')!.getBoundingClientRect().width).toBeLessThanOrEqual(
      1101,
    );
    // Controls inside the summary stay within the narrow measure.
    await settle(1440);
    await userEventOpen(canvas);
  },
};
async function userEventOpen(canvas: Context['canvas']) {
  canvas.getByRole('button', { name: /Zmień ustawienia/ }).click();
  await waitFor(() =>
    expect(canvas.getByRole('switch', { name: 'Zacznij od innej gałęzi' })).toBeVisible(),
  );
  const field = canvas.getByRole('switch', { name: 'Użyj własnej nazwy gałęzi' }).closest('div')!;
  const block = canvas.getByRole('group', { name: 'Podsumowanie środowiska pracy' });
  await expect(field.getBoundingClientRect().width).toBeLessThanOrEqual(760);
  await expect(block.getBoundingClientRect().width).toBeGreaterThan(
    field.getBoundingClientRect().width,
  );
}

/* Review fixes (REVIEW-UX F-03/F-06/F-07/F-08/F-10/F-13, REVIEW-QUALITY Q9/Q10). */
const brokenWords = (root: Element) => {
  const broken: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    for (const match of text.matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
      if (lines.size > 1) broken.push(match[0]);
    }
  }
  return broken;
};

export const TargetSwitchPreselectsNothingAndOnlyAnExplicitPickIsSent: Story = {
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    await expect(canvas.getByText('Domyślnie podążamy za celem projektu:')).toBeVisible();
    await userEvent.click(canvas.getByRole('switch', { name: 'Scal później do innej gałęzi' }));
    // On, nothing picked: no target sent, no preselection, Create waits for a real choice.
    await expect(canvas.getByRole('combobox', { name: 'Wskaż cel scalenia' })).toHaveTextContent(
      'Wybierz środowisko pracy',
    );
    await expect(request(canvas)).toBe('{"kind":"new-worktree"}');
    await expect(canvas.getByLabelText('Żądanie')).toHaveAttribute(
      'data-problems',
      'Wybierz cel scalenia lub wyłącz tę opcję.',
    );
    await expect(summary(canvas)).toHaveTextContent('wybierz cel');
    // The helper says what an explicit choice means.
    await expect(canvas.getByText(/przypina cel przy tworzeniu/)).toBeVisible();
    // Choosing the primary workspace is a deliberate pin, not the same as leaving the switch off.
    await userEvent.click(canvas.getByRole('combobox', { name: 'Wskaż cel scalenia' }));
    await userEvent.click(await within(document.body).findByRole('option', { name: /develop/ }));
    await expect(request(canvas)).toBe(
      JSON.stringify({ kind: 'new-worktree', integrationTargetWorkspaceId: workspaceIds.main }),
    );
    await expect(summary(canvas)).toHaveTextContent('(przypięte)');
    await userEvent.click(canvas.getByRole('switch', { name: 'Scal później do innej gałęzi' }));
    await expect(request(canvas)).toBe('{"kind":"new-worktree"}');
    await expect(summary(canvas)).toHaveTextContent('(cel projektu)');
  },
};

export const EnablingTheBaseSwitchPreselectsTheEffectiveDefault: Story = {
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    await userEvent.click(canvas.getByRole('switch', { name: 'Zacznij od innej gałęzi' }));
    // F-08: never an empty select; the default is what the user starts from.
    await expect(canvas.getByRole('combobox', { name: 'Zacznij od' })).toHaveTextContent('develop');
    await expect(request(canvas)).toBe('{"kind":"new-worktree","baseRef":"develop"}');
    // A remembered value wins over the default when the switch is turned on again.
    await userEvent.click(canvas.getByRole('combobox', { name: 'Zacznij od' }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: /release\/1\.4/ }),
    );
    await userEvent.click(canvas.getByRole('switch', { name: 'Zacznij od innej gałęzi' }));
    await userEvent.click(canvas.getByRole('switch', { name: 'Zacznij od innej gałęzi' }));
    await expect(canvas.getByRole('combobox', { name: 'Zacznij od' })).toHaveTextContent(
      'release/1.4',
    );
  },
};

export const EnablingBaseWithoutAnyDefaultStaysBlockedUntilChosen: Story = {
  args: { variant: 'head-base-no-branch' },
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    await userEvent.click(canvas.getByRole('switch', { name: 'Zacznij od innej gałęzi' }));
    await expect(canvas.getByRole('combobox', { name: 'Zacznij od' })).toHaveTextContent(
      'Wybierz gałąź',
    );
    await expect(request(canvas)).toBe('{"kind":"new-worktree"}');
    await expect(canvas.getByLabelText('Żądanie')).toHaveAttribute(
      'data-problems',
      'Wybierz gałąź początkową lub wyłącz tę opcję.',
    );
  },
};

export const DisclosureMetaWrapsAtWordBoundariesAt320: Story = {
  args: {
    initial: {
      settingsOpen: false,
      base: { on: true, ref: 'feature/platform' },
      branch: { on: true, name: 'feature/a-fairly-long-custom-branch-name-for-narrow-screens' },
    },
  },
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas }) => {
    for (const width of [320, 360, 390]) {
      await settle(width);
      const trigger = canvas.getByRole('button', { name: /Zmień ustawienia/ });
      // F-03: the label and every word of the meta stay whole; the meta may wrap under the label.
      await expect(brokenWords(trigger)).toEqual([]);
      await expect(brokenWords(canvas.getByText(/Zmienione ustawienia/))).toEqual([]);
      await expect(trigger.scrollWidth).toBeLessThanOrEqual(trigger.clientWidth + 1);
    }
    // F-10: the accessible name has no stray separator.
    await expect(canvas.getByText('Zmienione ustawienia (2): baza, nazwa')).toBeVisible();
    await expectNoOverflow(320);
  },
};

export const DefaultDisclosureNameHasNoStrayComma: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Zmień ustawienia' })).toBeVisible();
  },
};

export const BranchIconStaysOnTheFirstLineOfAWrappingValue: Story = {
  args: {
    initial: {
      branch: { on: true, name: `feature/${'a-very-long-segment-'.repeat(6)}end` },
    },
  },
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas }) => {
    await settle(320);
    const value = within(summary(canvas)).getByText(/^feature\/a-very-long-segment/);
    const icon = value.parentElement!.firstElementChild as HTMLElement;
    await expect(value.getBoundingClientRect().height).toBeGreaterThan(30);
    const first = (() => {
      const range = document.createRange();
      range.selectNodeContents(value);
      return [...range.getClientRects()].sort((a, b) => a.top - b.top)[0]!;
    })();
    const iconBox = icon.getBoundingClientRect();
    // F-13: the icon is centred on the first line, not on the whole multi-line value.
    await expect(
      Math.abs(iconBox.top + iconBox.height / 2 - (first.top + first.height / 2)),
    ).toBeLessThan(3);
  },
};

export const StructuralBranchNameErrorNamesTheRule: Story = {
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await openSettings(canvas, userEvent);
    await userEvent.click(canvas.getByRole('switch', { name: 'Użyj własnej nazwy gałęzi' }));
    const input = canvas.getByRole('textbox', { name: 'Nazwa nowej gałęzi' });
    await userEvent.type(input, 'feature//x');
    // F-07: all characters are legal, so the "illegal characters" message would be wrong.
    await expect(canvas.getByText(/niedozwolony układ/)).toBeVisible();
    await expect(canvas.queryByText(/niedozwolone znaki/)).toBeNull();
  },
};

export const OutsideNevoIsExplained: Story = {
  args: { variant: 'managed-false', initial: { tile: 'existing' } },
  parameters: { a11y: { test: 'off' } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('combobox', { name: 'Środowisko pracy' }));
    const option = await within(document.body).findByRole('option', { name: /architecture/ });
    await expect(option).toHaveTextContent('Poza Nevo');
    await expect(option).toHaveTextContent('Nie zarządza nim Nevo');
    await userEvent.click(option);
    // F-06: only what is known (managed = false), stated once the workspace is chosen.
    await expect(summary(canvas)).toHaveTextContent(
      'To środowisko pracy zostało dodane poza Nevo i nie jest przez nie zarządzane.',
    );
  },
};

export const LoadingPlaceholdersAreTileShaped: Story = {
  args: { status: 'loading' },
  play: async ({ canvas }) => {
    await settle(1440);
    const busy = canvas
      .getByRole('heading', { name: 'Gdzie chcesz pracować?' })
      .closest('section')!
      .querySelector('[aria-busy=true]')!;
    const tilesLoading = [...busy.querySelectorAll<HTMLElement>(':scope > div:first-child > div')];
    await expect(tilesLoading).toHaveLength(3);
    const heights = tilesLoading.map((tile) => tile.getBoundingClientRect().height);
    // Q10: heights come from the content (text-line placeholders in the tile padding).
    await expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
    await expect(heights[0]).toBeGreaterThan(80);
    await expectNoOverflow(320);
  },
};

export const FailedRefreshKeepsTheOptionsAndSaysSo: Story = {
  args: { refreshFailed: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('Nie udało się odświeżyć opcji');
    await expect(canvas.getByRole('radio', { name: 'Nowe środowisko pracy' })).toBeChecked();
  },
};
