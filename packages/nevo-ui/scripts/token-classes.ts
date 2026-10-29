/*
 * Undefined design-token class check.
 *
 * Tailwind silently emits nothing for a utility whose theme token does not exist
 * (e.g. `text-body-xs`, `text-content-info`), so the element inherits whatever is around it.
 * This check finds semantic-token utilities in UI sources and reports those whose token is not
 * defined in a Nevo UI `@theme` block.
 *
 * Usage (from the repository root):
 *   pnpm --filter @nevo/ui check:token-classes            # report only, exit 0
 *   pnpm --filter @nevo/ui check:token-classes --strict   # exit 1 on any violation
 *   ... -- <dir> [<dir>...]                               # override scanned directories
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TokenClassViolation {
  file: string;
  line: number;
  className: string;
  token: string;
}

/** Collects custom properties declared inside `@theme` blocks. */
export function collectThemeTokens(css: string): Set<string> {
  const tokens = new Set<string>();
  const themeBlock = /@theme[^{]*\{([\s\S]*?)\n\}/g;
  for (const block of css.matchAll(themeBlock)) {
    for (const declaration of block[1]!.matchAll(/(--[a-z0-9-]+)\s*:/g)) {
      tokens.add(declaration[1]!);
    }
  }

  return tokens;
}

const colorPrefixes =
  'text|bg|border|border-[xytrbl]|border-[se]|outline|ring|ring-offset|fill|stroke|divide|placeholder|decoration|caret|accent|from|via|to|shadow';
const colorRoots =
  'content|surface|status|action|border|focus|workspace|canvas|overlay|divider|progress|scrollbar|brand';
const textRoots = 'body|title|label|section|code';
const spacingPrefixes =
  'w|h|min-w|max-w|min-h|max-h|size|p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|inset|inset-x|inset-y|left|right|top|bottom|start|end|basis|translate-x|translate-y|space-x|space-y|scroll-m|scroll-p';
const spacingRoots = 'control|icon|content|tree|floating-window|status-indicator|progress-track';

// A class token starts after whitespace, a quote/backtick, a variant colon or `!`.
const boundary = String.raw`(?<=^|[\s'"\x60:!(,{])`;
const colorPattern = new RegExp(
  `${boundary}-?(${colorPrefixes})-((?:${colorRoots}|${textRoots})(?:-[a-z0-9]+)*)(?:\\/[0-9.]+)?(?=$|[\\s'"\\x60)\\],}])`,
  'g',
);
const spacingPattern = new RegExp(
  `${boundary}-?(${spacingPrefixes})-((?:${spacingRoots})(?:-[a-z0-9]+)*)(?=$|[\\s'"\\x60)\\],}])`,
  'g',
);

const textRootPattern = new RegExp(`^(?:${textRoots})-`);

function resolveToken(prefix: string, value: string, tokens: Set<string>): string | undefined {
  const candidates =
    prefix === 'text'
      ? textRootPattern.test(value)
        ? [`--text-${value}`, `--color-${value}`]
        : [`--color-${value}`, `--text-${value}`]
      : prefix === 'bg'
        ? [`--color-${value}`, `--background-image-${value}`]
        : [`--color-${value}`];

  return candidates.some((candidate) => tokens.has(candidate)) ? undefined : candidates[0];
}

export function findUndefinedTokenClasses(
  source: string,
  tokens: Set<string>,
  file = '<source>',
): TokenClassViolation[] {
  const violations: TokenClassViolation[] = [];
  const lines = source.split('\n');
  lines.forEach((text, index) => {
    for (const match of text.matchAll(colorPattern)) {
      const [className, prefix, value] = match as unknown as [string, string, string];
      const missing = resolveToken(prefix, value, tokens);
      if (missing) {
        violations.push({ file, line: index + 1, className, token: missing });
      }
    }

    for (const match of text.matchAll(spacingPattern)) {
      const [className, , value] = match as unknown as [string, string, string];
      const candidates = [`--spacing-${value}`, `--container-${value}`];
      if (!candidates.some((candidate) => tokens.has(candidate))) {
        violations.push({ file, line: index + 1, className, token: candidates[0]! });
      }
    }
  });

  return violations;
}

async function* sourceFiles(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(path);
    } else if (/\.(?:tsx?|mts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      yield path;
    }
  }
}

export async function loadNevoThemeTokens(packageDirectory: string): Promise<Set<string>> {
  const tokens = new Set<string>();
  for (const file of [
    'src/design-system.css',
    'src/design-system/brand-environment.generated.css',
  ]) {
    for (const token of collectThemeTokens(
      await readFile(resolve(packageDirectory, file), 'utf8'),
    )) {
      tokens.add(token);
    }
  }

  return tokens;
}

export async function scanDirectories(
  directories: string[],
  tokens: Set<string>,
  root: string,
): Promise<TokenClassViolation[]> {
  const violations: TokenClassViolation[] = [];
  for (const directory of directories) {
    for await (const file of sourceFiles(directory)) {
      const source = await readFile(file, 'utf8');
      violations.push(
        ...findUndefinedTokenClasses(source, tokens, relative(root, file).replaceAll('\\', '/')),
      );
    }
  }

  return violations;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const root = resolve(packageDirectory, '../..');
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const strict = args.includes('--strict');
  const explicit = args.filter((arg) => !arg.startsWith('--'));
  const directories = explicit.length
    ? explicit.map((directory) => resolve(root, directory))
    : ['packages/nevo-ui/src', 'packages/specflow-ui/src', 'examples'].map((directory) =>
        resolve(root, directory),
      );
  const tokens = await loadNevoThemeTokens(packageDirectory);
  const violations = await scanDirectories(directories, tokens, root);
  for (const violation of violations) {
    console.log(
      `${violation.file}:${violation.line}  ${violation.className}  (missing ${violation.token})`,
    );
  }

  console.log(
    `${violations.length} undefined design-token class${violations.length === 1 ? '' : 'es'} found.`,
  );
  if (strict && violations.length) {
    process.exitCode = 1;
  }
}
