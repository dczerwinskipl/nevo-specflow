import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { settleViewport } from '../../../../test-support/viewportSettle.stories-support';
import { ManagedSession } from '../ManagedSession';
import { fixtureApi, fixtureSessionId } from '../managedSession.stories-support';
import { genericSpecLevelContext } from '../context/sessionContextFixtures';
import { Environment } from '../managedSession.storyHelpers.stories-support';
import { stepBriefSnapshot } from './stepBrief.stories-support';

/**
 * The brief SpecFlow sends to start an agent's step: in the conversation it is SpecFlow's own line
 * (step and attempt), not the owner's bubble; "Show what the agent received" opens the brief on its
 * own screen, SpecFlow's words as Markdown and each block given as data labelled, the hand-off's
 * JSON pretty-printed.
 */
const meta = {
  title: 'SpecFlow/Screens/Managed Session',
  component: ManagedSession,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Environment>
        <Story />
      </Environment>
    ),
  ],
  args: {
    sessionId: fixtureSessionId,
    owner: 'brief-story',
    api: fixtureApi(stepBriefSnapshot()),
    sessionContext: genericSpecLevelContext(),
  },
} satisfies Meta<typeof ManagedSession>;
export default meta;
type Story = StoryObj<typeof meta>;

async function openBrief(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const line = await canvas.findByText(/agent otrzymał zlecenie wykonania kroku/);
  await expect(line).toHaveTextContent('Break the solution down · podejście 2');
  // Not the owner's bubble: the brief's text is not in the conversation.
  await expect(canvas.queryByText(/Draft Tasks that together cover/)).toBeNull();
  await userEvent.click(canvas.getByRole('button', { name: 'Pokaż, co otrzymał agent' }));
  const body = within(document.body);
  await expect(
    await body.findByRole('region', { name: 'Przekazanie z poprzedniego kroku' }),
  ).toBeVisible();
  await expect(body.getByRole('region', { name: 'Cel kroku' })).toHaveTextContent(
    'Draft Tasks that together cover the solution',
  );
  // The hand-off's JSON is pretty-printed, one field per line.
  await expect(
    body.getByRole('textbox', { name: 'Przekazanie z poprzedniego kroku' }),
  ).toHaveTextContent('"transition": "changes-requested"');
}

export const StepBriefDesktop: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    await settleViewport(1280, 900);
    await openBrief(canvasElement);
  },
};

export const StepBriefPhone: Story = {
  tags: ['contract'],
  play: async ({ canvasElement }) => {
    await settleViewport(412, 915);
    await openBrief(canvasElement);
  },
};
