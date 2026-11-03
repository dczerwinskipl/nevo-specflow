import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { ToolDetailCode } from './ToolDetailCode';

const longJson = JSON.stringify(
  {
    file_path: 'src/features/sessions/managed/very/deeply/nested/admission-readiness-policy.mjs',
    old_string:
      'if (revision !== current) reject(new Error("stale revision, reload and try again"));',
    new_string: 'if (revision !== (await reloadRevision())) reject();',
  },
  null,
  2,
);
const longOutput = Array.from(
  { length: 120 },
  (_, line) =>
    `src/admission.mjs:${line + 1}: const value${line} = computeSomethingRatherLong(${line});`,
).join('\n');

function Fixture({ width }: { width: number }) {
  return (
    <div className="grid gap-3" style={{ width }}>
      <ToolDetailCode text={longJson} language="json" label="Parametry" />
      <ToolDetailCode text={longOutput} language="plain" label="Odpowiedź narzędzia" />
    </div>
  );
}

const meta = {
  title: 'SpecFlow/Contracts/Tool detail code',
  component: Fixture,
  tags: ['contract'],
  args: { width: 330 },
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * At a 330px panel: each block is capped in height and scrolls both ways inside itself, long lines
 * are never wrapped, the clipped right/bottom edge shows the "more this way" fade, and the line
 * numbers stay pinned while the code scrolls sideways under them.
 */
export const NarrowPanel: Story = {
  play: async ({ canvas }) => {
    const output = canvas.getByRole('textbox', { name: 'Odpowiedź narzędzia' });
    const root = output.closest<HTMLElement>('.scroll-area')!;
    const viewport = root.querySelector<HTMLElement>('.scroll-area-viewport')!;

    // Height cap (max-h-80 = 20rem) with its own vertical scroll; no wrapping, so sideways too.
    await expect(viewport.clientHeight).toBeLessThanOrEqual(320);
    await expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    await expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth);
    await waitFor(() => expect(root).toHaveAttribute('data-edge-right', 'true'));
    await expect(root).toHaveAttribute('data-edge-bottom', 'true');
    // The start edges carry no cue: a left fade would cover the pinned line numbers.
    await expect(root).toHaveAttribute('data-edge-left', 'false');

    const gutter = root.querySelector<HTMLElement>('.cm-gutters')!;
    viewport.scrollLeft = viewport.scrollWidth;
    viewport.dispatchEvent(new Event('scroll'));
    await waitFor(() => expect(root).toHaveAttribute('data-edge-right', 'false'));
    await expect(Math.round(gutter.getBoundingClientRect().left)).toBe(
      Math.round(viewport.getBoundingClientRect().left),
    );
  },
};

/** The text is the one tab stop: focusable, read-only, and Tab moves on (no focus trap). */
export const KeyboardReachable: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const input = canvas.getByRole('textbox', { name: 'Parametry' });
    await expect(input).toHaveFocus();
    await expect(input).toHaveAttribute('aria-readonly', 'true');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await expect(input).toHaveFocus();
    await userEvent.tab();
    const output = canvas.getByRole('textbox', { name: 'Odpowiedź narzędzia' });
    await expect(output).toHaveFocus();
    const before = output.textContent;
    await userEvent.keyboard('x');
    await expect(output.textContent).toBe(before);
  },
};
