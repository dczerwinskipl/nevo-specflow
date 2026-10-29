import type { Meta, StoryObj } from '@storybook/react-vite';
import { MarkdownDocument } from './MarkdownDocument';

const sample = `# Design system document

A reusable Markdown renderer uses **existing typography roles** and [safe links](https://example.com).

## Lists and task state

- Compact document rhythm
- Existing semantic tokens
- [x] Read-only completed task
- [ ] Read-only pending task

### Code

Inline \`code\` stays compact.

\`\`\`ts
export function resolve(value: number) {
  return Math.max(0, value);
}
\`\`\`

> Blockquotes use the existing muted-content hierarchy.

| Item | State |
| --- | --- |
| Parser | Ready |
| Styling | Ready |
`;

const meta = {
  title: 'Nevo UI/Content/MarkdownDocument',
  component: MarkdownDocument,
  args: {
    source: sample,
  },
} satisfies Meta<typeof MarkdownDocument>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Narrow: Story = {
  render: (args) => (
    <div className="w-[26rem] max-w-full">
      <MarkdownDocument {...args} />
    </div>
  ),
};

export const RawHtmlIsNotEnabled: Story = {
  args: {
    source: '<script>alert("nope")</script>\n\n<strong>Raw HTML is not enabled.</strong>',
  },
};

export const ProductLinkRenderer: Story = {
  args: {
    source:
      'Open [src/app.ts](./src/app.ts) in the contextual file preview, or visit [docs](https://example.com).',
    renderLink: ({ children, href, title }) =>
      href?.startsWith('./') ? (
        <button
          className="text-content-link underline underline-offset-2 hover:text-content-link-hover"
          data-workspace-reference={href}
          title={title}
          type="button"
        >
          {children}
        </button>
      ) : undefined,
  },
};

export const EmbeddedUnderViewTitle: Story = {
  args: { source: '# Section below a view title\n\n## Subsection', headingOffset: 1 },
};

const wideTable = `| Id | Rule | Input | Success | Rejection | Message | Owner | Changed | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-001 | Completeness of the description | Title, description, criteria | Task continues | Task returns to its author with a list of gaps | Complete the missing fields before submitting again | Platform | 2026-03-02 | Presence only, not language quality. |
| R-002 | Conformance | Requirement id, spec revision | Task continues | Task rejected with the spec revision | https://example.invalid/a/very/long/address/without/any/spaces/that/must/wrap/or/scroll | Product | 2026-03-09 | Compared by stable id. |

| Left | Centre | Right |
| :--- | :---: | ---: |
| a | b | 1 |
| a longer cell | mid | 1 250,00 |
`;

const longCode = `Prose before the code.

\`\`\`ts
const value = 'a very long single line that cannot wrap and must scroll horizontally inside its own region instead of widening the page: ' + 'x'.repeat(200);
\`\`\`

\`\`\`
no language tag
\`\`\`
`;

const lists = `- one
  - two
    - three
      - four with a very long text that has to wrap inside its own indent without leaving the column
- [x] done
- [ ] todo
  - [x] nested done
  - [ ] nested todo

1. ordered
   - mixed
2. ordered again
   1. sub
   2. sub two

1. Step with a table:

   | A | B |
   | - | - |
   | 1 | 2 |
`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function overflowOf(element: Element) {
  return element.scrollWidth - element.clientWidth;
}

function frameOf(canvasElement: HTMLElement) {
  const frame = canvasElement.querySelector('[data-testid="frame"]');
  assert(frame, 'The story frame should render.');

  return frame;
}

const frame = (args: Parameters<typeof MarkdownDocument>[0], width = '22rem') => (
  <div className="max-w-full" data-testid="frame" style={{ width }}>
    <MarkdownDocument {...args} />
  </div>
);

export const WideTableScrollsInsideItsRegion: Story = {
  args: { source: wideTable },
  render: (args) => frame(args),
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, canvasElement }) => {
    const regions = await canvas.findAllByRole('group', { name: 'Table' });
    assert(regions.length === 2, 'Both tables should be named scroll groups.');
    const [wide, narrow] = regions;
    assert(wide && narrow, 'Tables should render.');
    assert(wide.getAttribute('tabindex') === '0', 'A table region must be keyboard focusable.');
    assert(overflowOf(wide) > 0, 'The wide table should scroll horizontally inside its region.');
    // The page (the story frame) never grows: only the table region scrolls.
    assert(overflowOf(frameOf(canvasElement)) <= 0, 'The page must not overflow.');
    const cell = Array.from(narrow.querySelectorAll('td')).find(
      (item) => item.textContent === '1 250,00',
    );
    assert(cell && getComputedStyle(cell).textAlign === 'right', 'Alignment should be honoured.');
  },
};

export const CodeBlocksScrollHorizontally: Story = {
  args: { source: longCode },
  render: (args) => frame(args),
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, canvasElement }) => {
    const blocks = await canvas.findAllByRole('group', { name: 'Code block' });
    assert(blocks.length === 2, 'Both code blocks should be named scroll groups.');
    assert(overflowOf(blocks[0]!) > 0, 'The long line should scroll inside its block.');
    assert(overflowOf(blocks[1]!) <= 0, 'A short block should not scroll.');
    assert(overflowOf(frameOf(canvasElement)) <= 0, 'The page must not overflow.');
  },
};

export const TaskAndNestedLists: Story = {
  args: { source: lists },
  render: (args) => frame(args),
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, canvasElement }) => {
    const done = await canvas.findAllByRole('checkbox', { name: 'Completed task' });
    const open = canvas.getAllByRole('checkbox', { name: 'Incomplete task' });
    assert(done.length === 2 && open.length === 2, 'Task states should be exposed.');
    assert(overflowOf(frameOf(canvasElement)) <= 0, 'The page must not overflow.');
  },
};

export const LongDocument: Story = {
  args: {
    source: Array.from(
      { length: 6 },
      (_, index) =>
        `## Section ${index + 1}

${sample}

${wideTable}
${longCode}
${lists}
---
`,
    ).join('\n'),
  },
  render: (args) => frame(args, '26rem'),
  tags: ['contract', '!autodocs'],
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole('heading', { name: 'Section 6' });
    assert(overflowOf(frameOf(canvasElement)) <= 0, 'The page must not overflow.');
  },
};

export const LocalizedRegionLabels: Story = {
  args: {
    source: [wideTable, '```ts', 'const a = 1;', '```'].join('\n'),
    labels: { table: 'Tabela', codeBlock: 'Blok kodu' },
  },
  tags: ['contract', '!autodocs'],
  play: async ({ canvas }) => {
    const tables = await canvas.findAllByRole('group', { name: 'Tabela' });
    assert(tables.length === 2, 'Table labels should be localized.');
    assert(canvas.getByRole('group', { name: 'Blok kodu' }), 'Code label should be localized.');
  },
};
