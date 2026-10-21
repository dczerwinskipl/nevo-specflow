import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { ArchetypeSummary } from './ArchetypeSummary';
import { catalogue } from './creationCatalogue.stories-support';
import { withLocale } from '../../../i18n/StoryLocalization';

const meta = {
  decorators: [withLocale('pl')],
  title: 'SpecFlow/Creation/Archetype Summary',
  component: ArchetypeSummary,
  args: { archetype: catalogue.archetypes[0] },
} satisfies Meta<typeof ArchetypeSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Feature: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Szczegóły dokumentów' }));
    await expect(canvas.getByText('specification.md')).toBeVisible();
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument();
  },
};
export const Empty: Story = { args: { archetype: catalogue.archetypes[1] } };
export const MissingMetadata: Story = {
  args: { archetype: { ...catalogue.archetypes[0]!, description: '', workflow: undefined } },
};
export const LongMetadata: Story = {
  args: {
    archetype: {
      ...catalogue.archetypes[0]!,
      description:
        'Doprecyzowanie rozbudowanej funkcjonalności, jej zależności oraz kryteriów akceptacji w wielu obszarach produktu.',
      workflow: {
        phases: [
          'Rozpoznanie zależności między obszarami',
          'Opracowanie i porównanie wariantów rozwiązania',
          'Weryfikacja scenariuszy i kryteriów akceptacji',
        ],
        requiredDocuments: [
          'specification.md',
          'bardzo-dluga-nazwa-dokumentu-wymaganego-do-weryfikacji.md',
        ],
        suggestedDocuments: [],
      },
    },
  },
};
