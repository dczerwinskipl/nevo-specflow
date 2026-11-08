export const DiscoveryEndpoint = {
  serverName: 'specflow-discovery',
  tools: ['list_directory', 'find_files', 'search_text'] as const,
} as const;

// A request fits native tool output comfortably, while scanning ordinary source
// trees rather than generated dependencies. A separate owned process bounds CPU,
// blocked filesystem I/O and cleanup; these are not native permission grants.
export const DiscoveryLimits = {
  depth: 32,
  entries: 10000,
  files: 1000,
  fileBytes: 256 * 1024,
  readBytes: 8 * 1024 * 1024,
  results: 200,
  outputBytes: 48 * 1024,
  concurrent: 2,
  durationMs: 10000,
} as const;
export type DiscoveryTool = (typeof DiscoveryEndpoint.tools)[number];
export interface DiscoveryRequest {
  path: string;
  pattern?: string;
  query?: string;
  includes: string[];
  excludes: string[];
  maxDepth: number;
  type: 'file' | 'directory' | 'any';
  caseInsensitive: boolean;
  matchPerLine: boolean;
}

export function discoveryTool(name: unknown): name is DiscoveryTool {
  return typeof name === 'string' && (DiscoveryEndpoint.tools as readonly string[]).includes(name);
}

export function parseDiscoveryRequest(tool: DiscoveryTool, value: unknown): DiscoveryRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Discovery arguments must be an object.');
  }

  const args = value as Record<string, unknown>;
  const keys = ['path', 'includes', 'excludes'];
  if (tool !== 'list_directory') {
    keys.push('maxDepth');
  }

  if (tool === 'find_files') {
    keys.push('pattern', 'type');
  }

  if (tool === 'search_text') {
    keys.push('query', 'caseInsensitive', 'matchPerLine');
  }

  if (Object.keys(args).some((key) => !keys.includes(key))) {
    throw new Error(
      'Unsupported discovery argument. Regex and native argument dictionaries are not supported.',
    );
  }

  const path = args.path ?? '.';
  if (
    typeof path !== 'string' ||
    path.length > 1024 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes(':') ||
    path.includes('\0') ||
    (path !== '.' &&
      path.split('/').some((part) => !part || part === '.' || part === '..' || /[ .]$/.test(part)))
  ) {
    throw new Error('Use a normalized workspace-relative path with forward slashes.');
  }

  const patterns = (input: unknown): string[] => {
    if (input === undefined) {
      return [];
    }

    if (
      !Array.isArray(input) ||
      input.length > 8 ||
      input.some(
        (p) =>
          typeof p !== 'string' ||
          !p ||
          p.length > 128 ||
          /[\\\0[\]{}!:]/.test(p) ||
          p.startsWith('/') ||
          p.split('/').includes('..'),
      )
    ) {
      throw new Error('Use at most eight simple relative globs (*, **, ?).');
    }

    return input as string[];
  };

  if (
    args.maxDepth !== undefined &&
    (!Number.isSafeInteger(args.maxDepth) ||
      (args.maxDepth as number) < 0 ||
      (args.maxDepth as number) > DiscoveryLimits.depth)
  ) {
    throw new Error('Invalid discovery depth.');
  }

  if (
    args.type !== undefined &&
    (typeof args.type !== 'string' || !['file', 'directory', 'any'].includes(args.type))
  ) {
    throw new Error('Invalid entry type.');
  }

  for (const key of ['caseInsensitive', 'matchPerLine']) {
    if (args[key] !== undefined && typeof args[key] !== 'boolean') {
      throw new Error('Invalid discovery search flag.');
    }
  }

  if (
    tool === 'find_files' &&
    (typeof args.pattern !== 'string' || patterns([args.pattern]).length !== 1)
  ) {
    throw new Error('A filename glob is required.');
  }

  if (
    tool === 'search_text' &&
    (typeof args.query !== 'string' ||
      !args.query ||
      args.query.length > 256 ||
      /[\r\n\0]/.test(args.query))
  ) {
    throw new Error('A nonempty, single-line literal query is required (up to 256 characters).');
  }

  return {
    path,
    pattern: args.pattern as string | undefined,
    query: args.query as string | undefined,
    includes: patterns(args.includes),
    excludes: patterns(args.excludes ?? ['**/node_modules/**']),
    maxDepth: (args.maxDepth as number | undefined) ?? (tool === 'list_directory' ? 0 : 16),
    type: (args.type as DiscoveryRequest['type'] | undefined) ?? 'file',
    caseInsensitive: args.caseInsensitive === true,
    matchPerLine: args.matchPerLine !== false,
  };
}

export const discoveryTools = DiscoveryEndpoint.tools.map((name) => ({
  name,
  description: `${name === 'list_directory' ? 'List directory entries' : name === 'find_files' ? 'Find files or directories by simple glob' : 'Search UTF-8 text for a literal query (not regex)'} inside the admitted local Windows x64 NTFS workspace. Paths use exact long-name casing and forward slashes, relative to the workspace. Globs are case-sensitive; caseInsensitive folds ASCII text only. Uses Runtime-owned confined reads, never a command. Links, .git, .nevo/local and active execution configuration are excluded. node_modules is excluded by default; excludes: [] includes ordinary dependency files. Results explicitly report partial/truncated/failure status and budgets. Native list_dir/find_by_name/grep_search arguments are not accepted.`,
  inputSchema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      path: { type: 'string', default: '.' },
      includes: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      excludes: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 8,
        default: ['**/node_modules/**'],
      },
      ...(name !== 'list_directory'
        ? { maxDepth: { type: 'integer', minimum: 0, maximum: 32 } }
        : {}),
      ...(name === 'find_files'
        ? { pattern: { type: 'string' }, type: { enum: ['file', 'directory', 'any'] } }
        : {}),
      ...(name === 'search_text'
        ? {
            query: { type: 'string', maxLength: 256 },
            caseInsensitive: { type: 'boolean' },
            matchPerLine: { type: 'boolean' },
          }
        : {}),
    },
    required: name === 'find_files' ? ['pattern'] : name === 'search_text' ? ['query'] : [],
  },
}));
