import { readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

import { parse } from 'yaml';

import type {
  ActivationPolicy,
  AgentInstruction,
  AgentKnowledge,
  Applies,
  Delivery,
  LoadedAgent,
} from './model.js';

const ID_RE = /^nevo-agents:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ITEM_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FORBIDDEN_FRAGMENT_HEADING_RE = /^#{1,2}\s+/m;
const TOP_LEVEL_KEYS = new Set([
  'version',
  'id',
  'name',
  'description',
  'activation',
  'knowledge',
  'instructions',
]);
const KNOWLEDGE_KEYS = new Set(['required']);
const INSTRUCTION_KEYS = new Set([
  'id',
  'title',
  'description',
  'source',
  'required',
  'applies',
  'delivery',
]);
const INACTIVE_DOC_STATUSES = new Set(['deprecated', 'superseded']);

interface IndexedDocument {
  readonly id: string;
  readonly status: string;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array of strings`);
  const result = value.map((item, index) => string(item, `${label}[${index}]`));
  const duplicates = result.filter((item, index) => result.indexOf(item) !== index);
  if (duplicates.length) {
    throw new Error(`${label} contains duplicate value(s): ${[...new Set(duplicates)].join(', ')}`);
  }
  return result;
}

function assertKnownKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} has unknown field(s): ${unknown.join(', ')}`);
}

function parseActivation(value: unknown, label: string): ActivationPolicy {
  if (value === 'explicit') return value;
  throw new Error(`${label} must be 'explicit'`);
}

function parseKnowledge(value: unknown, label: string): AgentKnowledge {
  const record = object(value, label);
  assertKnownKeys(record, KNOWLEDGE_KEYS, label);
  return { required: stringArray(record.required, `${label}.required`) };
}

function parseApplies(value: unknown, label: string): Applies {
  if (value === 'always') return 'always';
  const record = object(value, label);
  assertKnownKeys(record, new Set(['when']), label);
  return { when: string(record.when, `${label}.when`) };
}

function parseDelivery(value: unknown, label: string): Delivery {
  if (value === 'inline' || value === 'reference' || value === 'auto') return value;
  throw new Error(`${label} must be one of: inline, reference, auto`);
}

function resolveInstructionSource(
  repoRoot: string,
  definitionFile: string,
  source: string,
): string {
  if (isAbsolute(source))
    throw new Error(`${definitionFile}: instruction source must be repository-relative`);
  const absolute = resolve(dirname(definitionFile), source);
  const instructionRoot = resolve(repoRoot, '.nevo', 'agents', 'instructions');
  const rel = relative(instructionRoot, absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(
      `${definitionFile}: instruction source must stay under .nevo/agents/instructions`,
    );
  }
  return absolute;
}

function parseInstruction(
  value: unknown,
  index: number,
  repoRoot: string,
  definitionFile: string,
): AgentInstruction & { absoluteSource: string; content: string } {
  const label = `${definitionFile}: instructions[${index}]`;
  const record = object(value, label);
  assertKnownKeys(record, INSTRUCTION_KEYS, label);

  const id = string(record.id, `${label}.id`);
  if (!ITEM_ID_RE.test(id)) throw new Error(`${label}.id must be kebab-case`);
  const source = string(record.source, `${label}.source`);
  const absoluteSource = resolveInstructionSource(repoRoot, definitionFile, source);
  let content: string;
  try {
    content = readFileSync(absoluteSource, 'utf8').replace(/\r\n/g, '\n').trim();
  } catch (error) {
    throw new Error(`${definitionFile}: cannot read instruction source '${source}'`, {
      cause: error,
    });
  }
  if (!content) throw new Error(`${definitionFile}: instruction source '${source}' is empty`);
  if (FORBIDDEN_FRAGMENT_HEADING_RE.test(content)) {
    throw new Error(
      `${definitionFile}: instruction source '${source}' must be a fragment; headings must start at H3`,
    );
  }

  return {
    id,
    title: string(record.title, `${label}.title`),
    ...(record.description === undefined
      ? {}
      : { description: string(record.description, `${label}.description`) }),
    source,
    required: boolean(record.required, `${label}.required`),
    applies: parseApplies(record.applies, `${label}.applies`),
    delivery: parseDelivery(record.delivery, `${label}.delivery`),
    absoluteSource,
    content,
  };
}

function loadDocumentIndex(repoRoot: string): Map<string, IndexedDocument> {
  const file = join(repoRoot, 'docs', 'index.generated.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `cannot read ${file}; run 'pnpm docs:check --write' before building agent profiles`,
      { cause: error },
    );
  }

  const root = object(parsed, file);
  if (!Array.isArray(root.docs)) throw new Error(`${file}: 'docs' must be an array`);

  const byId = new Map<string, IndexedDocument>();
  for (const [index, value] of root.docs.entries()) {
    const record = object(value, `${file}: docs[${index}]`);
    const id = string(record.id, `${file}: docs[${index}].id`);
    const status = string(record.status, `${file}: docs[${index}].status`);
    byId.set(id, { id, status });
  }
  return byId;
}

function validateRequiredKnowledge(repoRoot: string, agents: readonly LoadedAgent[]): void {
  const docs = loadDocumentIndex(repoRoot);
  for (const agent of agents) {
    for (const id of agent.knowledge.required) {
      const doc = docs.get(id);
      if (!doc) {
        throw new Error(`${agent.file}: knowledge.required references unknown document id '${id}'`);
      }
      if (INACTIVE_DOC_STATUSES.has(doc.status)) {
        throw new Error(
          `${agent.file}: knowledge.required references inactive document '${id}' (${doc.status})`,
        );
      }
    }
  }
}

export function loadAgentDefinition(repoRoot: string, file: string): LoadedAgent {
  const absoluteFile = resolve(repoRoot, file);
  const parsed = parse(readFileSync(absoluteFile, 'utf8')) as unknown;
  const record = object(parsed, file);
  assertKnownKeys(record, TOP_LEVEL_KEYS, file);

  if (record.version !== 1) throw new Error(`${file}: version must be 1`);
  const id = string(record.id, `${file}.id`);
  if (!ID_RE.test(id)) throw new Error(`${file}: id must match nevo-agents:<kebab-name>`);
  const rawInstructions = record.instructions;
  if (!Array.isArray(rawInstructions) || rawInstructions.length === 0) {
    throw new Error(`${file}: instructions must be a non-empty array`);
  }

  const instructions = rawInstructions.map((item, index) =>
    parseInstruction(item, index, repoRoot, absoluteFile),
  );
  const instructionIds = new Set<string>();
  for (const instruction of instructions) {
    if (instructionIds.has(instruction.id))
      throw new Error(`${file}: duplicate instruction id '${instruction.id}'`);
    instructionIds.add(instruction.id);
  }

  return {
    version: 1,
    id,
    name: string(record.name, `${file}.name`),
    description: string(record.description, `${file}.description`),
    activation: parseActivation(record.activation, `${file}.activation`),
    knowledge: parseKnowledge(record.knowledge, `${file}.knowledge`),
    file: normalize(file).replaceAll('\\', '/'),
    instructions,
  };
}

export function loadAllAgents(repoRoot: string): LoadedAgent[] {
  const definitionsDir = join(repoRoot, '.nevo', 'agents', 'definitions');
  const files = readdirSync(definitionsDir)
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .sort();
  if (files.length === 0)
    throw new Error('no agent definitions found under .nevo/agents/definitions');

  const agents = files.map((file) =>
    loadAgentDefinition(repoRoot, `.nevo/agents/definitions/${file}`),
  );
  const ids = new Set<string>();
  for (const agent of agents) {
    if (ids.has(agent.id)) throw new Error(`duplicate agent id '${agent.id}'`);
    ids.add(agent.id);
  }

  validateRequiredKnowledge(repoRoot, agents);
  return agents;
}

export function providerSkillName(agentId: string): string {
  const name = agentId.replace(':', '-');
  if (!ITEM_ID_RE.test(name))
    throw new Error(`agent id '${agentId}' cannot be projected to a provider-safe skill name`);
  return name;
}
