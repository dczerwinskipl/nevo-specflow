import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionProviderIcon } from './SessionProviderIcon';

const meta = {
  title: 'SpecFlow/Components/Session Provider Identity',
  component: SessionProviderIcon,
  render: () => (
    <div className="grid gap-4 p-4 text-content-primary">
      {['codex', 'claude', 'unknown'].map((id) => (
        <div key={id} className="flex items-center gap-3">
          <SessionProviderIcon providerId={id} />
          <span>{id}</span>
        </div>
      ))}
      <div className="flex items-center gap-3 rounded-composite border border-focus-ring bg-surface-selected p-4">
        <SessionProviderIcon providerId="claude" />
        <span>Claude · wybrany</span>
      </div>
      <div aria-disabled="true" className="flex items-center gap-3 p-4">
        <SessionProviderIcon providerId="claude" />
        <span>Claude · niedostępny</span>
      </div>
    </div>
  ),
} satisfies Meta<typeof SessionProviderIcon>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
