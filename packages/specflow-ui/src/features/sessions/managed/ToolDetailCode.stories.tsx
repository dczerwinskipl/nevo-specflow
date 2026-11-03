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
/** What the Read tool returns: the file with its own `cat -n` numbers (number, tab, line). */
const numberedOutput = Array.from(
  { length: 120 },
  (_, line) =>
    `${String(line + 1).padStart(6)}\tconst value${line} = computeSomethingRatherLong(${line}, 'a long argument that runs past the panel');`,
).join('\n');

function Fixture({ width }: { width: number }) {
  return (
    <div className="grid gap-3" style={{ width }}>
      <ToolDetailCode text={longJson} language="json" label="Parametry" lineNumbers />
      <ToolDetailCode
        text={numberedOutput}
        language="plain"
        label="Odpowiedź narzędzia"
        lineNumbers={false}
      />
    </div>
  );
}

const meta = {
  title: 'SpecFlow/Components/Work Inspector',
  component: Fixture,
  tags: ['contract'],
  args: { width: 330 },
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;

function blockOf(textbox: HTMLElement) {
  const root = textbox.closest<HTMLElement>('.scroll-area')!;

  return { root, viewport: root.querySelector<HTMLElement>('.scroll-area-viewport')! };
}

/**
 * At a 330px panel: each block is capped in height and scrolls both ways inside itself, long lines
 * are never wrapped and never widen the panel, the clipped right/bottom edge shows the "more this
 * way" fade. The pretty-printed JSON (lines the product made) has a line-number gutter that stays
 * pinned while the code scrolls sideways; the tool's own output — here the Read tool's `cat -n`
 * numbered file — is shown verbatim with NO second gutter, its numbers being its own text.
 */
export const NarrowPanel: Story = {
  play: async ({ canvas, canvasElement }) => {
    const panel = canvasElement.querySelector<HTMLElement>('.grid')!;
    const output = canvas.getByRole('textbox', { name: 'Odpowiedź narzędzia' });
    const { root, viewport } = blockOf(output);

    // Height cap (max-h-80 = 20rem) with its own vertical scroll; no wrapping, so sideways too.
    await expect(viewport.clientHeight).toBeLessThanOrEqual(320);
    await expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    await expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth);
    // The long lines scroll inside the block; the block and the panel keep the panel's width.
    await expect(Math.round(root.getBoundingClientRect().width)).toBe(330);
    await expect(panel.scrollWidth).toBe(330);
    await waitFor(() => expect(root).toHaveAttribute('data-edge-right', 'true'));
    await expect(root).toHaveAttribute('data-edge-bottom', 'true');
    await expect(root).toHaveAttribute('data-edge-left', 'false');

    // Verbatim output: no gutter; the first visible text is the tool's own "     1\t...".
    await expect(output.closest('.cm-editor')!.querySelector('.cm-gutters')).toBeNull();
    await expect(output.querySelector('.cm-line')!.textContent).toBe(numberedOutput.split('\n')[0]);

    // Pretty-printed JSON: numbered, and the numbers stay pinned while the code scrolls sideways.
    const input = canvas.getByRole('textbox', { name: 'Parametry' });
    const json = blockOf(input);
    const gutter = json.root.querySelector<HTMLElement>('.cm-gutters')!;
    await expect(gutter).not.toBeNull();
    // CodeMirror's first gutter element is a hidden width spacer; the visible ones number the lines.
    const numbers = [...gutter.querySelectorAll<HTMLElement>('.cm-gutterElement')]
      .filter((element) => element.style.visibility !== 'hidden')
      .map((element) => element.textContent);
    await expect(numbers.slice(0, 3)).toEqual(['1', '2', '3']);
    await expect(json.viewport.scrollWidth).toBeGreaterThan(json.viewport.clientWidth);
    json.viewport.scrollLeft = json.viewport.scrollWidth;
    json.viewport.dispatchEvent(new Event('scroll'));
    await waitFor(() => expect(json.root).toHaveAttribute('data-edge-right', 'false'));
    await expect(Math.round(gutter.getBoundingClientRect().left)).toBe(
      Math.round(json.viewport.getBoundingClientRect().left),
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
