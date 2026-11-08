type Check = (value: unknown) => boolean;
const text: Check = (value) => typeof value === 'string' && !value.includes('\0');
const boolean: Check = (value) => typeof value === 'boolean';
const integer: Check = (value) => Number.isSafeInteger(value) && (value as number) >= 0;
const line: Check = (value) => integer(value) && (value as number) >= 1;
const strings: Check = (value) => Array.isArray(value) && value.length <= 256 && value.every(text);
const metadata = { toolSummary: text, toolAction: text };
const lineRange = { StartLine: line, EndLine: line };

function matches(
  value: unknown,
  fields: Record<string, Check>,
  required: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const args = value as Record<string, unknown>;

  return (
    required.every((key) => Object.hasOwn(args, key)) &&
    Object.entries(args).every(
      ([key, value]) => Object.hasOwn(fields, key) && fields[key]!(value),
    ) &&
    !(
      typeof args.StartLine === 'number' &&
      typeof args.EndLine === 'number' &&
      args.EndLine < args.StartLine
    )
  );
}

const chunkFields = {
  ...lineRange,
  TargetContent: text,
  ReplacementContent: text,
  AllowMultiple: boolean,
};
const chunks: Check = (value) =>
  Array.isArray(value) &&
  value.length >= 1 &&
  value.length <= 256 &&
  value.every((chunk) => matches(chunk, chunkFields, ['TargetContent', 'ReplacementContent']));

const schemas: Record<string, { required: readonly string[]; fields: Record<string, Check> }> = {
  view_file: {
    required: ['AbsolutePath'],
    fields: { ...metadata, ...lineRange, AbsolutePath: text, ContentOffset: integer },
  },
  list_dir: { required: ['DirectoryPath'], fields: { ...metadata, DirectoryPath: text } },
  find_by_name: {
    required: ['SearchDirectory', 'Pattern'],
    fields: {
      ...metadata,
      SearchDirectory: text,
      Pattern: text,
      Type: (value) => value === 'file' || value === 'directory' || value === 'any',
      Excludes: strings,
      Extensions: strings,
      FullPath: boolean,
      MaxDepth: integer,
    },
  },
  grep_search: {
    required: ['SearchPath', 'Query'],
    fields: {
      ...metadata,
      SearchPath: text,
      Query: text,
      Includes: strings,
      IsRegex: boolean,
      CaseInsensitive: boolean,
      MatchPerLine: boolean,
    },
  },
  write_to_file: {
    required: ['TargetFile', 'CodeContent'],
    fields: {
      ...metadata,
      TargetFile: text,
      CodeContent: text,
      Description: text,
      Overwrite: boolean,
      Append: boolean,
    },
  },
  replace_file_content: {
    required: ['TargetFile', 'TargetContent', 'ReplacementContent'],
    fields: {
      ...metadata,
      ...lineRange,
      TargetFile: text,
      TargetContent: text,
      ReplacementContent: text,
      Description: text,
      Instruction: text,
      AllowMultiple: boolean,
    },
  },
  multi_replace_file_content: {
    required: ['TargetFile', 'ReplacementChunks'],
    fields: {
      ...metadata,
      TargetFile: text,
      ReplacementChunks: chunks,
      Description: text,
      Instruction: text,
    },
  },
};

/** Only this explicitly supported native argument subset is admitted. Unverified
 * artifact/lint metadata and unknown variants cannot silently extend execution. */
export function validateAntigravityFileArguments(name: string, args: unknown) {
  const schema = Object.hasOwn(schemas, name) ? schemas[name] : undefined;
  if (!schema || !matches(args, schema.fields, schema.required)) {
    throw new Error('Unsupported native file tool arguments.');
  }
}
