import { isPair, isScalar, parseDocument, visit } from 'yaml';

/**
 * Strict YAML for definition files, stricter than the manifest parser: the core schema only, no tags
 * beyond it, aliases rejected (a definition has no use for them and they are the YAML bomb vector),
 * `<<` merge keys rejected and duplicate keys refused.
 */

export type YamlParseResult =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string };

const CORE_TAGS: ReadonlySet<string> = new Set(
  ['str', 'int', 'float', 'bool', 'null', 'map', 'seq'].map((name) => `tag:yaml.org,2002:${name}`),
);

const FAIL_PREFIX = 'The file is not valid YAML';

function firstLine(text: string): string {
  const line = text.split('\n', 1)[0] ?? '';

  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

export function parseDefinitionYaml(text: string): YamlParseResult {
  try {
    const document = parseDocument(text, {
      version: '1.2',
      schema: 'core',
      customTags: [],
      merge: false,
      uniqueKeys: true,
      prettyErrors: false,
    });
    const error = document.errors[0] ?? document.warnings[0];
    if (error) {
      return { ok: false, message: `${FAIL_PREFIX}: ${firstLine(error.message)}` };
    }

    let mergeKey = false;
    let extraTag = false;
    visit(document, {
      Node(_key, node) {
        const tag = (node as { tag?: string }).tag;
        if (tag !== undefined && !CORE_TAGS.has(tag)) {
          extraTag = true;

          return visit.BREAK;
        }

        return undefined;
      },
      Alias() {
        mergeKey = true;

        return visit.BREAK;
      },
      Pair(_key, pair) {
        if (isPair(pair) && isScalar(pair.key) && pair.key.value === '<<') {
          mergeKey = true;

          return visit.BREAK;
        }

        return undefined;
      },
    });
    if (extraTag) {
      return { ok: false, message: `${FAIL_PREFIX}: only the core YAML tags are allowed.` };
    }

    if (mergeKey) {
      return { ok: false, message: `${FAIL_PREFIX}: aliases and merge keys are not allowed.` };
    }

    return { ok: true, value: document.toJS({ maxAliasCount: 0 }) as unknown };
  } catch (error) {
    // `toJS` throws when an alias is resolved; a pathologically nested file can overflow the stack.
    const detail =
      error instanceof RangeError
        ? 'the nesting is too deep.'
        : error instanceof Error && /alias/iu.test(error.message)
          ? 'aliases and merge keys are not allowed.'
          : 'the document cannot be read.';

    return { ok: false, message: `${FAIL_PREFIX}: ${detail}` };
  }
}
