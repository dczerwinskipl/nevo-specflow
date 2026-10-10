import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SectionBoundary } from './SpecificationWorkSectionOutlet';

const expectedFailure = 'Expected contribution render failure';

function WorkSection({ fail }: { readonly fail: boolean }) {
  if (fail) throw new Error(expectedFailure);
  return <p>Contribution restored</p>;
}

function RecoverableWorkSection() {
  const [fail, setFail] = useState(true);
  return (
    <SectionBoundary
      onRetry={() => setFail(false)}
      fallback={(retry, recovering) => (
        <button type="button" onClick={retry} disabled={recovering}>
          Retry contribution
        </button>
      )}
    >
      <WorkSection fail={fail} />
    </SectionBoundary>
  );
}

const meta = {
  title: 'SpecFlow/Features/Work Section Recovery',
  component: RecoverableWorkSection,
  tags: ['integration'],
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: () => {
    // React reports the intentionally thrown test error. Preserve all other console errors.
    const originalError = console.error;
    console.error = (...args) => {
      if (args.some((arg) => arg instanceof Error && arg.message === expectedFailure)) return;
      originalError(...args);
    };
    return () => {
      console.error = originalError;
    };
  },
} satisfies Meta<typeof RecoverableWorkSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Exercise a real React render exception and explicit recovery, not mocked setState. */
export const RetryAfterRenderError: Story = {
  play: async ({ canvas, userEvent }) => {
    const retry = await canvas.findByRole('button', { name: 'Retry contribution' });
    await userEvent.click(retry);
    await canvas.findByText('Contribution restored');
  },
};
