import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { cn } from '@nevo/ui';
import { CodeView } from './CodeView';
import { codeSurfaceClassName } from './codeViewTheme';

const jsonSample = JSON.stringify(
  {
    file_path: 'src/admission.mjs',
    replace_all: false,
    limit: 42,
    next: null,
    lines: [42, 43, 44],
  },
  null,
  2,
);
const markdownSample = [
  '# Feature: Logowanie SSO',
  '',
  '- Powrót do projektu po zalogowaniu',
  '- Token `identity_token` w sesji',
  '',
  'Zobacz [specyfikację](https://example.com).',
].join('\n');
const plainSample = [
  ' FAIL  test/admission.test.mjs > rejects a stale revision',
  '   AssertionError: expected "accepted" to be "rejected"',
  '',
  ' Test Files  1 failed | 7 passed (8)',
].join('\n');

const meta = {
  title: 'SpecFlow/Components/Code View',
  component: CodeView,
  parameters: { layout: 'padded' },
  args: { value: jsonSample, language: 'json', label: 'Parametry', readOnly: true },
  render: (args) => (
    <div className="flex h-72 max-w-xl flex-col">
      <CodeView {...args} className={cn('min-h-0 flex-1 overflow-hidden', codeSurfaceClassName)} />
    </div>
  ),
} satisfies Meta<typeof CodeView>;
export default meta;
type Story = StoryObj<typeof meta>;

const samples = {
  json: { language: 'json', label: 'Parametry', readOnly: true },
  markdown: { language: 'markdown', label: 'Treść notes.md', readOnly: false },
  plain: { language: 'plain', label: 'Odpowiedź narzędzia', readOnly: true },
} as const;

/** The representative view: pick the content kind; language and label follow it. */
export const Default: Story = {
  args: { value: jsonSample },
  argTypes: {
    value: {
      name: 'content',
      control: 'select',
      options: ['json', 'markdown', 'plain'],
      mapping: { json: jsonSample, markdown: markdownSample, plain: plainSample },
    },
    language: { table: { disable: true } },
    label: { table: { disable: true } },
  },
  render: (args) => {
    const sample =
      args.value === markdownSample
        ? samples.markdown
        : args.value === plainSample
          ? samples.plain
          : samples.json;

    return (
      <div className="flex h-72 max-w-xl flex-col">
        <CodeView
          {...args}
          {...sample}
          className={cn('min-h-0 flex-1 overflow-hidden', codeSurfaceClassName)}
        />
      </div>
    );
  },
};

/** JSON on DS tokens: keys, strings, literal constants and punctuation each in their own role. */
export const Json: Story = {
  tags: ['contract'],
  play: async ({ canvas }) => {
    const text = canvas.getByRole('textbox', { name: 'Parametry' });
    await expect(text).toHaveAttribute('aria-readonly', 'true');
    const color = (token: string) =>
      getComputedStyle(
        [...text.querySelectorAll<HTMLElement>('.cm-line span')].find(
          (span) => span.textContent === token,
        )!,
      ).color;
    await expect(
      new Set([color('"file_path"'), color('"src/admission.mjs"'), color('42')]).size,
    ).toBe(3);
    await expect(color('null')).toBe(color('42'));
  },
};

export const Markdown: Story = {
  tags: ['contract'],
  args: { value: markdownSample, language: 'markdown', label: 'Treść notes.md', readOnly: false },
};

/** Verbatim output: the same view, no colouring. */
export const PlainText: Story = {
  tags: ['contract'],
  args: { value: plainSample, language: 'plain', label: 'Odpowiedź narzędzia' },
};
