import { useId } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Icon, Typography } from '../components';
import {
  choiceSurfaceCheckClassName,
  choiceSurfaceClassName,
  choiceSurfaceTracksClassName,
} from './choiceSurfaceRecipes';

const options = [
  { key: 'standard', title: 'Standard', description: 'Process using the default method.' },
  {
    key: 'extended',
    title: 'Extended processing with a deliberately long descriptive name',
    description: 'Additional context remains readable and wraps without a fixed card height.',
  },
  {
    key: 'long-token',
    title: 'provider-adapter-with-an-unbroken-identifier-that-must-wrap',
    description:
      'Long unbroken names wrap inside the text track instead of pushing the check slot out.',
  },
  {
    key: 'unavailable',
    title: 'Unavailable method',
    description: 'This environment does not support this method. The reason stays readable.',
    disabled: true,
  },
];

function ChoiceSurfaceExample() {
  const id = useId();
  return (
    <div className="grid w-full max-w-content-narrow gap-6">
      <button className={choiceSurfaceClassName} type="button">
        <span className={choiceSurfaceTracksClassName}>
          <Icon name="file" />
          <span className="min-w-0">
            <Typography className="block" variant="title-sm">
              Create a document
            </Typography>
            <Typography className="mt-1 block text-content-secondary" variant="body-sm">
              A command with a description that wraps naturally on a narrow screen.
            </Typography>
          </span>
        </span>
      </button>
      <fieldset className="min-w-0">
        <legend className="mb-3 text-title-sm">Choose a processing method</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((option) => (
            <label className={`${choiceSurfaceClassName} group block`} key={option.key}>
              <input
                aria-describedby={`${id}-${option.key}-description`}
                aria-labelledby={`${id}-${option.key}-title`}
                className="sr-only"
                defaultChecked={option.key === 'standard'}
                disabled={option.disabled}
                name={`${id}-method`}
                type="radio"
                value={option.key}
              />
              <span className={choiceSurfaceTracksClassName} data-testid={`${option.key}-tracks`}>
                <Icon className={option.disabled ? 'text-content-muted' : undefined} name="file" />
                <span className="min-w-0 break-words">
                  <Typography
                    className={`block ${option.disabled ? 'text-content-secondary' : ''}`}
                    id={`${id}-${option.key}-title`}
                    variant="title-sm"
                  >
                    {option.title}
                  </Typography>
                  <Typography
                    className="mt-1 block text-content-secondary"
                    id={`${id}-${option.key}-description`}
                    variant="body-sm"
                  >
                    {option.description}
                  </Typography>
                </span>
                <span
                  aria-hidden="true"
                  className={`${choiceSurfaceCheckClassName} invisible justify-center group-has-[:checked]:visible`}
                  data-testid={`${option.key}-check`}
                >
                  <Icon name="check" size="sm" />
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

const meta = {
  title: 'Nevo UI/Foundations/ChoiceSurface',
  component: ChoiceSurfaceExample,
  tags: ['autodocs'],
} satisfies Meta<typeof ChoiceSurfaceExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Narrow: Story = { globals: { viewport: { value: 'mobile1', isRotated: false } } };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const InteractionContract: Story = {
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, canvasElement, userEvent }) => {
    const standard = canvas.getByRole<HTMLInputElement>('radio', { name: 'Standard' });
    const extended = canvas.getByRole<HTMLInputElement>('radio', { name: /Extended processing/ });
    const unavailable = canvas.getByRole<HTMLInputElement>('radio', {
      name: 'Unavailable method',
    });
    const surface = extended.closest('label')!;
    assert(
      getComputedStyle(standard.closest('label')!).borderColor !==
        getComputedStyle(surface).borderColor,
      `Checked and unchecked choices must have distinct semantic borders (${getComputedStyle(standard.closest('label')!).borderColor} / ${getComputedStyle(surface).borderColor}; checked ${standard.checked}).`,
    );
    const before = surface.getBoundingClientRect();
    const checkSlot = canvasElement.querySelector<HTMLElement>('[data-testid="extended-check"]')!;
    const slotBefore = checkSlot.getBoundingClientRect();
    await userEvent.click(extended);
    assert(extended.checked && !standard.checked, 'Radio choices remain mutually exclusive.');
    const after = surface.getBoundingClientRect();
    assert(
      before.width === after.width && before.height === after.height,
      'Selection must preserve geometry.',
    );
    const slotAfter = checkSlot.getBoundingClientRect();
    assert(
      slotBefore.left === slotAfter.left && slotBefore.width === slotAfter.width,
      'The trailing check slot is reserved whether or not the choice is selected.',
    );
    assert(
      getComputedStyle(checkSlot).visibility === 'visible',
      'The selected choice shows its check.',
    );
    const cardRect = extended.closest('label')!.getBoundingClientRect();
    const slotMid = slotAfter.top + slotAfter.height / 2;
    assert(
      Math.abs(slotMid - (cardRect.top + cardRect.height / 2)) <= 1,
      `The check is vertically centred on the card (${slotMid} vs ${cardRect.top + cardRect.height / 2}).`,
    );

    assert(unavailable.disabled, 'Unavailable choices retain native disabled semantics.');
    const disabledSurface = unavailable.closest('label')!;
    const enabledStyle = getComputedStyle(standard.closest('label')!);
    const disabledStyle = getComputedStyle(disabledSurface);
    assert(
      disabledStyle.opacity === '1',
      'Unavailable information must remain readable (no opacity).',
    );
    assert(
      disabledStyle.backgroundColor !== enabledStyle.backgroundColor &&
        disabledStyle.borderTopColor !== enabledStyle.borderTopColor,
      'A disabled choice must be visibly distinct from an enabled one at rest.',
    );
    const reason = canvas.getByText(/The reason stays readable/);
    assert(getComputedStyle(reason).opacity === '1', 'The unavailable reason must not fade.');
    const background = disabledStyle.backgroundColor;
    await userEvent.hover(disabledSurface);
    assert(
      getComputedStyle(disabledSurface).backgroundColor === background,
      'Disabled surfaces must not gain an active hover background.',
    );

    extended.focus();
    await userEvent.keyboard('{ArrowLeft}');
    assert(standard.checked, 'Native radio arrow navigation remains available.');
    const focusSurface = standard.closest('label')!;
    assert(
      getComputedStyle(focusSurface).outlineStyle !== 'none',
      'The surface delegates visible keyboard focus.',
    );
    for (const label of canvasElement.querySelectorAll('label')) {
      assert(
        label.scrollWidth <= label.clientWidth,
        'Long content must wrap within the choice surface.',
      );
    }
  },
};

export const NarrowInteractionContract: Story = {
  tags: ['contract', '!autodocs'],
  play: InteractionContract.play,
  globals: Narrow.globals,
};
