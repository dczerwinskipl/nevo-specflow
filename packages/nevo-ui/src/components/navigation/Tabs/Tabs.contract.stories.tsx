import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs } from './Tabs';
import { TabsExample } from './Tabs.storyFixtures';

const meta = {
  title: 'Nevo UI/Navigation/Tabs',
  tags: ['!dev', '!autodocs'],
  parameters: { controls: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const InteractionContract: Story = {
  render: () => <TabsExample disabledActivity />,
  play: async ({ canvas, userEvent }) => {
    const tabs = canvas.getAllByRole('tab') as HTMLButtonElement[];
    const [overview, activity, settings] = tabs;
    assert(overview && activity && settings, 'The fixture should render all tabs.');

    assert(
      overview.getAttribute('aria-selected') === 'true',
      'The initial tab should be selected.',
    );
    assert(overview.tabIndex === 0, 'The selected tab should be in the tab order.');
    assert(activity.disabled, 'The disabled tab should keep native disabled semantics.');
    assert(activity.tabIndex === -1, 'The disabled tab should be removed from the tab order.');

    overview.focus();
    await userEvent.keyboard('{ArrowRight}');
    assert(document.activeElement === settings, 'ArrowRight should skip disabled tabs.');
    assert(
      settings.getAttribute('aria-selected') === 'true',
      'Keyboard focus should activate its tab.',
    );

    await userEvent.keyboard('{ArrowRight}');
    assert(document.activeElement === overview, 'ArrowRight should wrap to the first enabled tab.');

    await userEvent.keyboard('{End}');
    assert(document.activeElement === settings, 'End should focus the last enabled tab.');
    await userEvent.keyboard('{Home}');
    assert(document.activeElement === overview, 'Home should focus the first enabled tab.');
    await userEvent.keyboard('{ArrowLeft}');
    assert(document.activeElement === settings, 'ArrowLeft should wrap to the last enabled tab.');

    const panel = canvas.getByRole('tabpanel', { name: 'Settings' });
    assert(
      settings.getAttribute('aria-controls') === panel.id,
      'The active tab should control its panel.',
    );
    assert(
      panel.getAttribute('aria-labelledby') === settings.id,
      'The panel should reference its tab.',
    );
  },
};

function RovingTabStopScenarios() {
  const [selectedDisabled, setSelectedDisabled] = useState(false);
  const panels = (values: string[]) =>
    values.map((value) => (
      <Tabs.Content key={value} value={value}>
        {value} panel
      </Tabs.Content>
    ));

  return (
    <div className="grid gap-8 p-8">
      <button type="button" onClick={() => setSelectedDisabled(true)}>
        Disable selected tab
      </button>

      <section data-testid="selected-becomes-disabled">
        <Tabs defaultValue="activity">
          <Tabs.List aria-label="Selected becomes disabled">
            <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
            <Tabs.Trigger disabled={selectedDisabled} value="activity">
              Activity
            </Tabs.Trigger>
          </Tabs.List>
          {panels(['overview', 'activity'])}
        </Tabs>
      </section>

      <section data-testid="first-disabled">
        <Tabs defaultValue="activity">
          <Tabs.List aria-label="First trigger disabled">
            <Tabs.Trigger disabled value="overview">
              Overview
            </Tabs.Trigger>
            <Tabs.Trigger value="activity">Activity</Tabs.Trigger>
          </Tabs.List>
          {panels(['overview', 'activity'])}
        </Tabs>
      </section>

      <section data-testid="multiple-disabled">
        <Tabs defaultValue="missing">
          <Tabs.List aria-label="Multiple triggers disabled">
            <Tabs.Trigger disabled value="overview">
              Overview
            </Tabs.Trigger>
            <Tabs.Trigger disabled value="activity">
              Activity
            </Tabs.Trigger>
            <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
          </Tabs.List>
          {panels(['overview', 'activity', 'settings'])}
        </Tabs>
      </section>

      <section data-testid="all-disabled">
        <Tabs defaultValue="overview">
          <Tabs.List aria-label="All triggers disabled">
            <Tabs.Trigger disabled value="overview">
              Overview
            </Tabs.Trigger>
            <Tabs.Trigger disabled value="activity">
              Activity
            </Tabs.Trigger>
          </Tabs.List>
          {panels(['overview', 'activity'])}
        </Tabs>
      </section>

      <section data-testid="controlled-selected-disabled">
        <Tabs onValueChange={() => undefined} value="activity">
          <Tabs.List aria-label="Controlled selected trigger disabled">
            <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
            <Tabs.Trigger disabled value="activity">
              Activity
            </Tabs.Trigger>
          </Tabs.List>
          {panels(['overview', 'activity'])}
        </Tabs>
      </section>
    </div>
  );
}

export const RovingTabStopContract: Story = {
  render: () => <RovingTabStopScenarios />,
  parameters: { layout: 'fullscreen' },
  play: async ({ canvas, userEvent }) => {
    const tabsFor = (testId: string) =>
      Array.from(canvas.getByTestId(testId).querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const zeroTabStops = (tabs: HTMLButtonElement[]) => tabs.filter((tab) => tab.tabIndex === 0);

    const dynamicBefore = tabsFor('selected-becomes-disabled');
    assert(
      dynamicBefore[1]!.tabIndex === 0,
      'The initially selected enabled trigger should be tabbable.',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Disable selected tab' }));
    const dynamicAfter = tabsFor('selected-becomes-disabled');
    assert(dynamicAfter[1]!.disabled, 'The selected trigger should become natively disabled.');
    assert(
      dynamicAfter[1]!.getAttribute('aria-selected') === 'true',
      'Disabling must not silently change selection.',
    );
    assert(
      dynamicAfter[0]!.tabIndex === 0,
      'The first enabled trigger should become the roving tab stop.',
    );
    assert(zeroTabStops(dynamicAfter).length === 1, 'The list should expose exactly one tab stop.');

    const firstDisabled = tabsFor('first-disabled');
    assert(firstDisabled[0]!.tabIndex === -1, 'A disabled first trigger must not be tabbable.');
    assert(firstDisabled[1]!.tabIndex === 0, 'The selected enabled trigger should remain tabbable.');

    const multipleDisabled = tabsFor('multiple-disabled');
    assert(
      zeroTabStops(multipleDisabled).length === 1,
      'A list with enabled triggers should expose one tab stop.',
    );
    assert(
      multipleDisabled[2]!.tabIndex === 0,
      'A missing selection should fall back to the first enabled trigger.',
    );

    const allDisabled = tabsFor('all-disabled');
    assert(
      zeroTabStops(allDisabled).length === 0,
      'An all-disabled list should not expose a tab stop.',
    );

    const controlled = tabsFor('controlled-selected-disabled');
    assert(
      controlled[1]!.getAttribute('aria-selected') === 'true',
      'Controlled selection should remain unchanged.',
    );
    assert(
      controlled[1]!.tabIndex === -1,
      'The controlled disabled selection must not be tabbable.',
    );
    assert(
      controlled[0]!.tabIndex === 0,
      'Controlled Tabs should fall back to the first enabled trigger.',
    );
  },
};

