import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

type Block = Linter.Config;

// The block exactly as SpecFlow UI's ESLint config builds it (glyph aliases, ignores, registry
// names), by URL: the config is JavaScript outside this package's TypeScript sources.
const configModule = new URL('../../../../../tools/eslint/specflow-ui.mjs', import.meta.url).href;
const { specflowUiBoundaries } = (await import(/* @vite-ignore */ configModule)) as {
  specflowUiBoundaries: Block[];
};
const block = specflowUiBoundaries.find((entry) => entry.plugins?.['specflow-icons']);

function problems(code: string, filename = 'src/features/tasks/Probe.tsx'): string[] {
  const linter = new Linter({ configType: 'flat' });
  const config: Linter.Config[] = [
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    block as Linter.Config,
  ];

  return linter
    .verify(code, config, { filename })
    .map((message) => `${message.line}:${message.ruleId ?? message.message}`);
}

const rule = 'specflow-icons/no-direct-product-icon';

describe('the product icon lint rule', () => {
  it('refuses a dictionary glyph from lucide-react, under any of its names', () => {
    expect(
      problems("import { FileText, House, LucideHistory, ChevronDown } from 'lucide-react';"),
    ).toEqual([`1:${rule}`, `1:${rule}`, `1:${rule}`]);
    expect(problems("import { ListChecks } from 'lucide-react';")).toEqual([`1:${rule}`]);
    expect(problems("import * as lucide from 'lucide-react';")).toEqual([`1:${rule}`]);
  });

  it('refuses the Icon registry names of product glyphs in icon positions only', () => {
    expect(
      problems(
        [
          'const a = <Icon name="file" />;',
          'const b = <Button leadingIcon={on ? "chat" : "plus"} />;',
          "const c = { icon: 'list-checks' as const };",
          "const d = { icon: { name: 'workflow', className: '' } };",
          "const kindIcon = { doc: 'book-open', path: 'folder' };",
          'function Row({ glyph = "file" }) { return glyph; }',
        ].join('\n'),
      ),
    ).toEqual([1, 2, 3, 4, 5, 6].map((line) => `${line}:${rule}`));
    // The same words as data are not icons.
    expect(
      problems(
        [
          'const a = <Field name="branch" />;',
          "const b = { kind: 'file', id: 'branch' };",
          "const c = error.kind === 'network' ? 1 : 2;",
          'const d = <Icon name="folder" />;',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('lets the dictionary module and tests use the glyphs', () => {
    const code = "import { FileText } from 'lucide-react';";

    expect(problems(code, 'src/shared/product-icons/productIcons.ts')).toEqual([]);
    expect(problems(code, 'src/features/tasks/Probe.test.tsx')).toEqual([]);
  });
});
