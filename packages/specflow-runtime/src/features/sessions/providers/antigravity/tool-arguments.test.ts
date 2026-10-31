import { describe, expect, it } from 'vitest';
import { validateAntigravityFileArguments } from './tool-arguments';

describe('supported Antigravity file argument subset', () => {
  it.each([
    ['find_by_name', { SearchDirectory: '/workspace', Pattern: '*', Excludes: '*.secret' }],
    ['find_by_name', { SearchDirectory: '/workspace', Pattern: '*', Extensions: [true] }],
    ['find_by_name', { SearchDirectory: '/workspace', Pattern: '*', MaxDepth: -1 }],
    ['find_by_name', { SearchDirectory: '/workspace', Pattern: '*', FullPath: 'true' }],
    ['grep_search', { SearchPath: '/workspace', Query: 'x', IsRegex: 'false' }],
    ['write_to_file', { TargetFile: '/workspace/a', CodeContent: 'x', Overwrite: 'false' }],
    ['write_to_file', { TargetFile: '/workspace/a', CodeContent: ['x'] }],
    ['write_to_file', { TargetFile: '/workspace/a', CodeContent: 'x', ArtifactMetadata: {} }],
    ['multi_replace_file_content', { TargetFile: '/workspace/a', ReplacementChunks: [] }],
    [
      'multi_replace_file_content',
      {
        TargetFile: '/workspace/a',
        ReplacementChunks: [{ TargetContent: 'a', ReplacementContent: 'b', unknown: true }],
      },
    ],
    ['view_file', { AbsolutePath: '/workspace/a', StartLine: 9, EndLine: 1 }],
  ])('rejects invalid or unverified %s arguments', (name, args) => {
    expect(() => validateAntigravityFileArguments(name, args)).toThrow();
  });

  it('accepts bounded typed filters and replacement chunks', () => {
    expect(() =>
      validateAntigravityFileArguments('find_by_name', {
        SearchDirectory: '/workspace',
        Pattern: '*.ts',
        Type: 'file',
        Excludes: ['node_modules'],
        Extensions: ['ts'],
        FullPath: false,
        MaxDepth: 3,
      }),
    ).not.toThrow();
    expect(() =>
      validateAntigravityFileArguments('multi_replace_file_content', {
        TargetFile: '/workspace/a',
        ReplacementChunks: [
          {
            TargetContent: 'a',
            ReplacementContent: 'b',
            StartLine: 1,
            EndLine: 1,
          },
        ],
      }),
    ).not.toThrow();
  });
});
