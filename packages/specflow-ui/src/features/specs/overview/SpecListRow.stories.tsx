import { InformationList } from '@nevo/ui';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { createSpecItem } from '../../../../test-support/specs/overview/fixtures';
import { currentRow } from './presentation';
import { SpecListRow } from './SpecListRow';

function HrefOnlySpecRow() {
  return (
    <StoryLocalization locale="en">
      <InformationList>
        <SpecListRow item={currentRow(createSpecItem())} specificationHref="/specs/admission" />
      </InformationList>
    </StoryLocalization>
  );
}

const meta = {
  title: 'SpecFlow/Features/Specification Row',
  component: HrefOnlySpecRow,
  tags: ['integration'],
} satisfies Meta<typeof HrefOnlySpecRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A standalone href renders the specification identity as a real link. Rows have no per-row
 * overflow menu, so the link is the only navigation affordance and nothing else may offer it.
 */
export const HrefOnlyNavigation: Story = {
  play: ({ canvas }) => {
    const link = canvas.getByRole('link', {
      name: 'Open specification: Deterministic admission and execution boundaries',
    });
    if (link.getAttribute('href') !== '/specs/admission') {
      throw new Error('Specification identity must remain a real link.');
    }
    if (canvas.queryByRole('button', { name: /^Specification actions/ })) {
      throw new Error('Rows must not expose a per-row overflow menu.');
    }
    if (canvas.getAllByRole('link').length !== 1) {
      throw new Error('The specification link is the only link in the row.');
    }
  },
};

function HrefWithCallbackRow() {
  const [opened, setOpened] = useState(false);
  return (
    <StoryLocalization locale="en">
      <InformationList>
        <SpecListRow
          item={currentRow(createSpecItem())}
          specificationHref="/specs/admission"
          onOpenTarget={() => setOpened(true)}
        />
      </InformationList>
      <output aria-label="Navigation result">{opened ? 'opened' : 'idle'}</output>
    </StoryLocalization>
  );
}

export const HrefWithCallback: Story = {
  render: () => <HrefWithCallbackRow />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('link', {
        name: 'Open specification: Deterministic admission and execution boundaries',
      }),
    );
    await canvas.findByText('opened');
  },
};
