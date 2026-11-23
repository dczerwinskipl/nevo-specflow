import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';
import {
  assertStackedOptionText,
  assertSelectionPreservesContent,
} from '../shared/optionTextGeometry.stories-support';
import { Field } from '../Field';
import { Badge } from '../../feedback/Badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../overlays/Dialog';
import { Combobox, ComboboxItem } from './Combobox';

const meta = {
  title: 'Nevo UI/Forms/Combobox/Contract',
  tags: ['contract', '!autodocs'],
  parameters: { controls: { disable: true }, layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** The list renders in a portal outside the canvas, so it is queried from the document. */
const listed = () => [...document.querySelectorAll<HTMLElement>('[role=option]')];
const listbox = () => document.querySelector<HTMLElement>('[role=listbox]');

async function until<T>(read: () => T | null | undefined | false): Promise<T> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = read();
    if (result) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for the Combobox list.');
}

async function waitForOptions(): Promise<HTMLElement[]> {
  return until(() => {
    const found = listed();

    return found.length > 0 ? found : null;
  });
}

const cities = [
  'Gdańsk',
  'Kraków',
  'Lublin',
  'Łódź',
  'Olsztyn',
  'Poznań',
  'Rzeszów',
  'Szczecin',
  'Warszawa',
  'Wrocław',
  'Żary',
];

function Picker({ unavailable = false }: { unavailable?: boolean }) {
  const [value, setValue] = useState<string | null>(null);

  return (
    <div className="w-80" data-testid="picker" data-value={value ?? ''}>
      <Field>
        <Field.Label>Workspace</Field.Label>
        <Combobox onValueChange={setValue} placeholder="Choose a workspace" value={value}>
          {cities.map((city) => (
            <ComboboxItem
              key={city}
              value={city}
              unavailable={unavailable && city === 'Gdańsk'}
              description={unavailable && city === 'Gdańsk' ? 'Already in use.' : undefined}
            >
              {city}
            </ComboboxItem>
          ))}
        </Combobox>
      </Field>
    </div>
  );
}

const selectedValue = (canvas: { getByTestId: (id: string) => HTMLElement }) =>
  canvas.getByTestId('picker').getAttribute('data-value');

function DialogPicker() {
  const [open, setOpen] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose workspace</DialogTitle>
          <DialogDescription>Find a workspace and select it.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Picker />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** Portalled React Aria options remain part of their enclosing Radix modal. */
export const InsideDialog: Story = {
  render: () => <DialogPicker />,
  play: async ({ userEvent }) => {
    const input = await until(() => document.querySelector<HTMLInputElement>('[role=combobox]'));
    await userEvent.click(input);
    await userEvent.type(input, 'wro');
    const [option] = await waitForOptions();
    assert(option?.textContent === 'Wrocław', 'Typing finds the workspace.');
    await userEvent.click(option);
    await until(
      () =>
        document.querySelector('[data-testid=picker]')?.getAttribute('data-value') === 'Wrocław',
    );
    assert(document.activeElement === input, 'Pointer selection keeps focus in the control.');
    await userEvent.keyboard('{ArrowDown}');
    await until(listbox);
    await userEvent.keyboard('{Escape}');
    await until(() => !listbox());
    assert(!!document.querySelector('[role=dialog]'), 'Escape dismisses only the nested list.');
    await userEvent.keyboard('{Escape}');
    await until(() => !document.querySelector('[role=dialog]'));
    await until(() => getComputedStyle(document.body).pointerEvents !== 'none');
  },
};

export const FilteringAndKeyboard: Story = {
  render: () => <Picker />,
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('combobox', { name: 'Workspace' });
    assert(input instanceof HTMLInputElement, 'The combobox is a text input.');
    await userEvent.click(input);
    await userEvent.type(input, 'w');
    const options = await waitForOptions();
    const names = options.map((option) => option.textContent);
    assert(
      names.includes('Warszawa') && names.includes('Wrocław') && !names.includes('Lublin'),
      `Typing filters the list: ${names.join()}`,
    );
    assert(document.activeElement === input, 'Focus stays in the input while the list is open.');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    assert(
      input.getAttribute('aria-activedescendant') !== null,
      'The active option is exposed through aria-activedescendant.',
    );
    await userEvent.keyboard('{Enter}');
    assert(selectedValue(canvas) !== '', 'Enter selects the active option.');
    assert(input.value === selectedValue(canvas), 'The input shows the selected label.');
    await userEvent.clear(input);
    await userEvent.type(input, 'zzz');
    await until(() => document.querySelector('[role=status]')?.textContent === 'No results');
    await userEvent.keyboard('{Escape}');
    assert(
      input.value === selectedValue(canvas),
      'Escape closes the list and restores the selected label.',
    );
  },
};

export const PolishDiacritics: Story = {
  render: () => <Picker />,
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('combobox', { name: 'Workspace' });
    await userEvent.type(input, 'lodz');
    const options = await waitForOptions();
    assert(
      options.length === 1 && options[0]?.textContent === 'Łódź',
      'lodz finds the diacritic option.',
    );
    await userEvent.clear(input);
    await userEvent.type(input, 'ZARY');
    const zary = await waitForOptions();
    assert(zary[0]?.textContent === 'Żary', 'Case and diacritics are ignored.');
  },
};

export const UnavailableOptionIsNotSelectable: Story = {
  render: () => <Picker unavailable />,
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('combobox', { name: 'Workspace' });
    await userEvent.click(canvas.getByRole('button', { name: /Show options/ }));
    const option = await until(() =>
      listed().find((option) => option.textContent?.includes('Gdańsk')),
    );
    assert(option.getAttribute('aria-disabled') === 'true', 'The option is aria-disabled.');
    assert(option.textContent?.includes('Already in use.'), 'The reason is visible in the option.');
    option.click();
    assert(selectedValue(canvas) === '', 'An unavailable option cannot be selected.');
    assert((input as HTMLInputElement).value !== 'Gdańsk', 'The input is not filled.');
  },
};

export const NearViewportBottomFlipsUp: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="flex h-screen items-end p-4">
      <div className="w-80" data-testid="anchor">
        <Combobox aria-label="Workspace" placeholder="Choose a workspace">
          {cities.map((city) => (
            <ComboboxItem key={city} value={city}>
              {city}
            </ComboboxItem>
          ))}
        </Combobox>
      </div>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Show options/ }));
    const list = await until(listbox);
    const popover = list.parentElement!.getBoundingClientRect();
    const input = canvas.getByRole('combobox').getBoundingClientRect();
    assert(popover.bottom <= input.top + 1, 'The list flips above the input near the bottom.');
    assert(popover.top >= 0, 'The list stays inside the viewport.');
  },
};

export const LongLabelsAndNarrowContainer: Story = {
  render: () => (
    <div className="w-72" data-testid="narrow">
      <Combobox aria-label="Branch" placeholder="Choose a branch">
        <ComboboxItem
          value="long"
          description="An explanatory second line that must wrap instead of being clipped by the list."
        >
          feature/documents-explorer-with-a-very-long-descriptive-branch-name
        </ComboboxItem>
        <ComboboxItem value="short">main</ComboboxItem>
      </Combobox>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Show options/ }));
    const list = await until(listbox);
    const trigger = canvas.getByRole('combobox').getBoundingClientRect();
    const rect = list.parentElement!.getBoundingClientRect();
    assert(rect.width >= trigger.width - 1, 'The list is at least as wide as the input.');
    assert(rect.right <= window.innerWidth, 'The list never exceeds the viewport.');
    const description = [
      ...list.querySelectorAll<HTMLElement>('[data-combobox-item-part=description]'),
    ][0]!;
    assert(description.scrollHeight <= description.clientHeight + 1, 'The description wraps.');
    const label = list.querySelector('[data-combobox-item-part=label]')!;
    assert(
      label.scrollWidth <= label.clientWidth + 1,
      'The long label wraps instead of being cut.',
    );
  },
};

export const SimilarLongValuesStayDistinguishable: Story = {
  render: () => (
    <div className="w-60" data-testid="narrow">
      <Combobox aria-label="Branch" placeholder="Choose a branch">
        <ComboboxItem meta="1 spec" value="a">
          feature/scroll-position-restoration-320
        </ComboboxItem>
        <ComboboxItem meta="1 spec" value="b">
          feature/scroll-position-restoration-320-2
        </ComboboxItem>
      </Combobox>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /Show options/ }));
    await until(listbox);
    const labels = [
      ...document.querySelectorAll<HTMLElement>('[role=option] [data-combobox-item-part=label]'),
    ];
    assert(labels.length === 2, 'Both options are listed.');
    for (const label of labels) {
      assert(label.scrollWidth <= label.clientWidth + 1, 'No option label is ellipsised.');
    }

    const list = listbox()!.parentElement!.getBoundingClientRect();
    assert(list.right <= window.innerWidth, 'The list stays inside the viewport.');
  },
};

export const InputClickOpensTheList: Story = {
  render: () => <Picker />,
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('combobox', { name: 'Workspace' });
    assert(input.getAttribute('aria-expanded') === 'false', 'The list starts closed.');
    await userEvent.click(input);
    await waitForOptions();
    assert(input.getAttribute('aria-expanded') === 'true', 'Clicking the input opens the list.');
  },
};

export const InputRefReachesTheInput: Story = {
  render: () => {
    function WithRef() {
      const ref = useRef<HTMLInputElement>(null);

      return (
        <div className="w-80">
          <button onClick={() => ref.current?.focus()} type="button">
            Focus the combobox
          </button>
          <Combobox aria-label="Workspace" inputRef={ref}>
            <ComboboxItem value="a">Alpha</ComboboxItem>
          </Combobox>
        </div>
      );
    }

    return <WithRef />;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Focus the combobox' }));
    assert(document.activeElement === canvas.getByRole('combobox'), 'The ref focuses the input.');
  },
};

export const FieldLabelFocusesInput: Story = {
  render: () => <Picker />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText('Workspace'));
    assert(
      document.activeElement === canvas.getByRole('combobox', { name: 'Workspace' }),
      'Clicking the Field label focuses the input.',
    );
  },
};

export const TabDoesNotCommitPartialText: Story = {
  render: () => <Picker />,
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('combobox', { name: 'Workspace' });
    await userEvent.type(input, 'war');
    await waitForOptions();
    await userEvent.tab();
    assert(selectedValue(canvas) === '', 'Tab leaves the value untouched.');
    assert((input as HTMLInputElement).value === '', 'Partial text is discarded.');
  },
};

export const NarrowDescriptionAndMetadata: Story = {
  render: () => (
    <div className="w-72">
      <Combobox defaultValue="chosen" aria-label="Starting branch" placeholder="Choose a branch">
        <ComboboxItem
          value="chosen"
          className="selection-contract-option"
          description="Configuration ready"
          meta={<Badge>Ready</Badge>}
        >
          feature/a-long-starting-branch-name-that-must-wrap-and-remain-fully-readable
        </ComboboxItem>
        <ComboboxItem
          value="other"
          className="selection-contract-option"
          description="Configuration ready"
          meta={<Badge>Ready</Badge>}
        >
          feature/a-long-starting-branch-name-that-must-wrap-and-remain-fully-readable
        </ComboboxItem>
        <ComboboxItem value="available">main</ComboboxItem>
        <ComboboxItem
          value="invalid"
          unavailable
          description="Niepoprawny YAML"
          meta="ma środowisko pracy · zmiany"
        >
          feature/setup
        </ComboboxItem>
        <ComboboxItem
          value="long"
          unavailable
          description="NiepoprawnaKonfiguracjaProjektuSpecFlow"
          meta="ma środowisko pracy · zmiany"
        >
          feature/long
        </ComboboxItem>
      </Combobox>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const { page } = await import('vitest/browser');
    const previous = { width: window.innerWidth, height: window.innerHeight };
    try {
      await page.viewport(320, 640);
      await until(() => window.innerWidth === 320);
      const input = canvas.getByRole('combobox', { name: 'Starting branch' });
      assert(input.getBoundingClientRect().width <= 288, 'The source control must stay narrow.');
      input.focus();
      await userEvent.keyboard('{ArrowDown}');
      const list = await until(listbox);
      await document.fonts.ready;
      const focused = await until(() => list.querySelector<HTMLElement>('[data-focused]'));
      assert(
        getComputedStyle(focused).outlineStyle === 'solid' &&
          parseFloat(getComputedStyle(focused).outlineWidth) > 0,
        'Keyboard focus has a visible outline independent of the selected background.',
      );
      const options = list.querySelectorAll<HTMLElement>('[data-unavailable]');
      assert(options.length === 2, 'Both unavailable reasons must be listed.');
      for (const option of options) {
        assertStackedOptionText(option, 'combobox');
      }

      const pair = list.querySelectorAll<HTMLElement>('.selection-contract-option');
      assert(pair.length === 2, 'Selected and unselected twins must be listed.');
      assertSelectionPreservesContent(pair[0]!, pair[1]!, 'combobox');
      assertStackedOptionText(pair[0]!, 'combobox');
      const metadata = pair[0]!.querySelector<HTMLElement>('[data-combobox-item-part=meta]')!;
      assert(
        metadata.getBoundingClientRect().width < pair[0]!.getBoundingClientRect().width / 2,
        'A Badge keeps its natural width.',
      );
      const labelSelector = '[data-combobox-item-part=label]';
      const before = pair[0]!.querySelector<HTMLElement>(labelSelector)!.getBoundingClientRect();
      await userEvent.click(pair[1]!);
      await until(() => !listbox());
      input.focus();
      await userEvent.keyboard('{ArrowDown}');
      const changedList = await until(listbox);
      const changedPair = changedList.querySelectorAll<HTMLElement>('.selection-contract-option');
      assertSelectionPreservesContent(changedPair[1]!, changedPair[0]!, 'combobox');
      const after = changedPair[0]!
        .querySelector<HTMLElement>(labelSelector)!
        .getBoundingClientRect();
      assert(
        Math.abs(after.width - before.width) < 1 && Math.abs(after.height - before.height) < 1,
        `Changing selection keeps the name geometry stable: before ${before.width}x${before.height}, after ${after.width}x${after.height}.`,
      );
    } finally {
      if (listbox()) {
        await userEvent.keyboard('{Escape}');
        await until(() => !listbox());
      }

      await page.viewport(previous.width, previous.height);
      await until(() => window.innerWidth === previous.width);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
  },
};
