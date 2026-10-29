import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';
import { useState } from 'react';
import type { Meta, StoryContext, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { withLocale } from '../../../../i18n/StoryLocalization';
import { catalogue as demoCatalogue } from './creationCatalogue.stories-support';
import { ArchetypeSection } from './ArchetypeSection';
import {
  initialArchetypeChoice,
  refreshedArchetypeChoice,
  selectedArchetype,
  type ArchetypeChoice,
} from './archetypeChoice';

/** The real catalogue: sorted by id, no `defaultArchetypeId`. */
const { defaultArchetypeId: _default, ...withoutDefault } = demoCatalogue;
const several: ArchetypeCatalogue = withoutDefault;
const single: ArchetypeCatalogue = { ...several, archetypes: several.archetypes.slice(0, 1) };

/** The section with the choice it holds, and what the form's readiness would say. */
function Host({ catalogue }: { catalogue: ArchetypeCatalogue }) {
  const [choice, setChoice] = useState<ArchetypeChoice>(initialArchetypeChoice);
  const [served, setServed] = useState(catalogue);
  const chosen = selectedArchetype(served, choice);
  return (
    <div className="grid max-w-content-narrow gap-4 p-6">
      <ArchetypeSection
        state={{ status: 'ready', catalogue: served }}
        choice={choice}
        locked={false}
        onChange={setChoice}
      />
      <output aria-label="Selected archetype">{chosen?.id ?? 'none'}</output>
      <button
        type="button"
        onClick={() => {
          // The catalogue changed under the form (`CATALOGUE_STALE`): a new revision, same ids.
          setServed({ ...served, revision: `${served.revision}-next` });
          setChoice((current) => refreshedArchetypeChoice(current, 'CATALOGUE_STALE'));
        }}
      >
        Refresh archetypes
      </button>
    </div>
  );
}

const meta = {
  title: 'SpecFlow/Contracts/Create archetype selection',
  component: Host,
  decorators: [withLocale('pl')],
  tags: ['contract'],
  args: { catalogue: demoCatalogue },
} satisfies Meta<typeof Host>;
export default meta;
type Story = StoryObj<typeof meta>;

const selected = (canvas: Pick<StoryContext['canvas'], 'getByRole'>) =>
  canvas.getByRole('status', { name: 'Selected archetype' });

/** The catalogue names a default (the demo): it is selected and its documents are listed. */
export const DefaultPresent: Story = {
  play: async ({ canvas }) => {
    await expect(selected(canvas)).toHaveTextContent(demoCatalogue.defaultArchetypeId!);
    await expect(canvas.getByText('Dokumenty do utworzenia')).toBeVisible();
  },
};

/** One archetype: it is the only choice, so it is selected. */
export const SingleArchetype: Story = {
  args: { catalogue: single },
  play: async ({ canvas }) => {
    await expect(selected(canvas)).toHaveTextContent(single.archetypes[0]!.id);
    await expect(canvas.getByRole('radio')).toBeChecked();
  },
};

/**
 * Several archetypes and no default (the real catalogue): nothing is selected, a quiet prompt
 * stands in for the documents, and the first radio is reachable with Tab.
 */
export const SeveralWithoutDefault: Story = {
  args: { catalogue: several },
  play: async ({ canvas, userEvent }) => {
    await expect(selected(canvas)).toHaveTextContent('none');
    for (const radio of canvas.getAllByRole('radio')) await expect(radio).not.toBeChecked();
    await expect(
      canvas.getByText('Wybierz archetyp, aby zobaczyć dokumenty, które powstaną.'),
    ).toBeVisible();
    await expect(canvas.queryByText('Dokumenty do utworzenia')).toBeNull();
    await userEvent.tab();
    await expect(canvas.getAllByRole('radio')[0]).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(selected(canvas)).toHaveTextContent(several.archetypes[0]!.id);
    await expect(canvas.getByText('Dokumenty do utworzenia')).toBeVisible();
  },
};

/** A refreshed catalogue keeps the user's choice while it still exists. */
export const RefreshKeepsTheChoice: Story = {
  args: { catalogue: several },
  play: async ({ canvas, userEvent }) => {
    const last = several.archetypes.at(-1)!;
    await userEvent.click(canvas.getByRole('radio', { name: new RegExp(last.title) }));
    await userEvent.click(canvas.getByRole('button', { name: 'Refresh archetypes' }));
    await expect(selected(canvas)).toHaveTextContent(last.id);
  },
};

/** No definitions installed in the project: a neutral line with the command, no radio list. */
export const NoArchetypesInstalled: Story = {
  args: { catalogue: { ...several, archetypes: [] } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/W tym projekcie nie zainstalowano archetypów/)).toBeVisible();
    await expect(canvas.getByText('nevo-specflow definitions install')).toBeVisible();
    await expect(canvas.queryByRole('radio')).toBeNull();
    await expect(selected(canvas)).toHaveTextContent('none');
  },
};
