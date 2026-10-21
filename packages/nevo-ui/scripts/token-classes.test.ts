import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectThemeTokens,
  findUndefinedTokenClasses,
  loadNevoThemeTokens,
  scanDirectories,
} from './token-classes';

const tokens = collectThemeTokens(`@theme static {
  --color-content-muted: #888;
  --color-border-default: #222;
  --color-status-info: #00f;
  --text-body-sm: 0.75rem;
  --spacing-icon-md: 1.125rem;
  --background-image-workspace: none;
}`);

describe('undefined design-token class check', () => {
  it('reports semantic utilities whose token is not defined', () => {
    const source = `const a = cn('text-body-xs text-content-info hover:bg-surface-default', "border-border-default");`;
    expect(
      findUndefinedTokenClasses(source, tokens).map((violation) => violation.className),
    ).toEqual(['text-body-xs', 'text-content-info', 'bg-surface-default']);
  });

  it('accepts defined colour, typography, spacing and background-image tokens', () => {
    const source =
      "cn('text-body-sm text-content-muted text-status-info/80 [&:is(:disabled)]:border-border-default size-icon-md bg-workspace')";
    expect(findUndefinedTokenClasses(source, tokens)).toEqual([]);
  });

  it('ignores non-semantic utilities and prose', () => {
    expect(
      findUndefinedTokenClasses("cn('text-left border-b bg-transparent') // body text", tokens),
    ).toEqual([]);
  });

  it('keeps Nevo UI itself free of undefined token classes', async () => {
    const packageDirectory = resolve(import.meta.dirname, '..');
    const nevoTokens = await loadNevoThemeTokens(packageDirectory);
    const violations = await scanDirectories(
      [resolve(packageDirectory, 'src')],
      nevoTokens,
      packageDirectory,
    );
    expect(violations).toEqual([]);
  }, 30_000);
});
