import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildAgents, checkAgents, parseProviders } from '../src/generate.js';
import { loadAgentDefinition, providerSkillName } from '../src/load.js';
import { renderSkill } from '../src/render.js';

const REQUIRED_DOC = 'architecture.principles.normative-language';

function writeIndex(root: string, status = 'current'): void {
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(
    join(root, 'docs/index.generated.json'),
    `${JSON.stringify({ docs: [{ id: REQUIRED_DOC, status }] }, null, 2)}\n`,
  );
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'nevo-agents-'));
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  mkdirSync(join(root, '.nevo/agents/definitions'), { recursive: true });
  mkdirSync(join(root, '.nevo/agents/instructions'), { recursive: true });
  writeIndex(root);
  writeFileSync(join(root, '.nevo/agents/instructions/role.md'), 'Do the work.\n');
  writeFileSync(join(root, '.nevo/agents/instructions/git.md'), 'Follow Git rules.\n');
  writeFileSync(
    join(root, '.nevo/agents/definitions/implementer.yaml'),
    [
      'version: 1',
      'id: nevo-agents:implementer',
      'name: Implementer',
      'description: Implements changes.',
      'selection:',
      '  modes:',
      '    - explicit',
      '    - automatic',
      'knowledge:',
      '  required:',
      `    - ${REQUIRED_DOC}`,
      'instructions:',
      '  - id: role',
      '    title: Role',
      '    source: ../instructions/role.md',
      '    required: true',
      '    applies: always',
      '    delivery: inline',
      '  - id: git',
      '    title: Git',
      '    description: Git guidance.',
      '    source: ../instructions/git.md',
      '    required: true',
      '    applies:',
      '      when: performing Git operations',
      '    delivery: auto',
      '',
    ].join('\n'),
  );
  return root;
}

describe('agent definition', () => {
  it('loads YAML and keeps instruction content outside the definition', () => {
    const root = fixture();
    const agent = loadAgentDefinition(root, '.nevo/agents/definitions/implementer.yaml');
    expect(agent.id).toBe('nevo-agents:implementer');
    expect(agent.selection.modes).toEqual(['explicit', 'automatic']);
    expect(agent.knowledge.required).toEqual([REQUIRED_DOC]);
    expect(agent.instructions.map((instruction) => instruction.content)).toEqual([
      'Do the work.',
      'Follow Git rules.',
    ]);
  });

  it('rejects H1/H2 headings inside instruction fragments', () => {
    const root = fixture();
    writeFileSync(join(root, '.nevo/agents/instructions/role.md'), '## Wrong level\n');
    expect(() => loadAgentDefinition(root, '.nevo/agents/definitions/implementer.yaml')).toThrow(
      /headings must start at H3/,
    );
  });

  it('rejects unsupported selection modes', () => {
    const root = fixture();
    const path = join(root, '.nevo/agents/definitions/implementer.yaml');
    writeFileSync(path, readFileSync(path, 'utf8').replace('    - automatic', '    - autonomous'));
    expect(() => loadAgentDefinition(root, '.nevo/agents/definitions/implementer.yaml')).toThrow(
      /selection\.modes.*unsupported.*autonomous/,
    );
  });

  it('rejects duplicate selection modes', () => {
    const root = fixture();
    const path = join(root, '.nevo/agents/definitions/implementer.yaml');
    writeFileSync(path, readFileSync(path, 'utf8').replace('    - automatic', '    - explicit'));
    expect(() => loadAgentDefinition(root, '.nevo/agents/definitions/implementer.yaml')).toThrow(
      /selection\.modes.*duplicate/,
    );
  });

  it('projects canonical names to provider-safe kebab names', () => {
    expect(providerSkillName('nevo-agents:implementer-ui')).toBe('nevo-agents-implementer-ui');
  });
});

describe('rendering', () => {
  it('keeps automatically eligible profiles discoverable and documents selection semantics', () => {
    const root = fixture();
    const agent = loadAgentDefinition(root, '.nevo/agents/definitions/implementer.yaml');
    const output = join(root, '.agents/skills/nevo-agents-implementer/SKILL.md');
    const rendered = renderSkill(root, agent, output, 'embed').content;
    expect(rendered).toContain('description: "Implements changes."');
    expect(rendered).toContain('**Selection:** explicit or automatic.');
    expect(rendered).toContain('Selection happens before the profile becomes active');
    expect(rendered).toContain(`pnpm docs:get ${REQUIRED_DOC}`);
    expect(rendered).not.toContain('Use only when the nevo-agents:implementer profile');
  });

  it('projects an explicit-only profile as explicit-only provider guidance', () => {
    const root = fixture();
    const definition = join(root, '.nevo/agents/definitions/implementer.yaml');
    writeFileSync(definition, readFileSync(definition, 'utf8').replace('    - automatic\n', ''));
    const agent = loadAgentDefinition(root, '.nevo/agents/definitions/implementer.yaml');
    const output = join(root, '.agents/skills/nevo-agents-implementer/SKILL.md');
    const rendered = renderSkill(root, agent, output, 'embed').content;
    expect(rendered).toContain(
      'Use only when the nevo-agents:implementer profile is explicitly selected',
    );
    expect(rendered).toContain('**Selection:** explicit only.');
  });

  it('embed mode materializes auto conditional content', () => {
    const root = fixture();
    const agent = loadAgentDefinition(root, '.nevo/agents/definitions/implementer.yaml');
    const output = join(root, '.agents/skills/nevo-agents-implementer/SKILL.md');
    const rendered = renderSkill(root, agent, output, 'embed').content;
    expect(rendered).toContain('name: nevo-agents-implementer');
    expect(rendered).toContain('## Git');
    expect(rendered).toContain('**Applies when:** performing Git operations.');
    expect(rendered).toContain('Follow Git rules.');
    expect(rendered).not.toContain('## Conditional instructions');
  });

  it('reference mode links auto conditional content instead of copying it', () => {
    const root = fixture();
    const agent = loadAgentDefinition(root, '.nevo/agents/definitions/implementer.yaml');
    const output = join(root, '.agents/skills/nevo-agents-implementer/SKILL.md');
    const rendered = renderSkill(root, agent, output, 'reference').content;
    expect(rendered).toContain('## Conditional instructions');
    expect(rendered).toContain('performing Git operations');
    expect(rendered).toContain('.nevo/agents/instructions/git.md');
    expect(rendered).not.toContain('Follow Git rules.');
  });
});

describe('build/check', () => {
  it('builds Claude and shared Agent Skills projections deterministically', () => {
    const root = fixture();
    buildAgents(root, ['claude', 'codex', 'antigravity'], 'embed');
    expect(checkAgents(root, ['claude', 'codex', 'antigravity'], 'embed')).toEqual([]);
    expect(
      readFileSync(join(root, '.claude/skills/nevo-agents-implementer/SKILL.md'), 'utf8'),
    ).toBe(readFileSync(join(root, '.agents/skills/nevo-agents-implementer/SKILL.md'), 'utf8'));
  });

  it('fails when required knowledge points to an unknown document', () => {
    const root = fixture();
    const path = join(root, '.nevo/agents/definitions/implementer.yaml');
    writeFileSync(path, readFileSync(path, 'utf8').replace(REQUIRED_DOC, 'engineering.missing'));
    expect(() => buildAgents(root, ['claude'], 'embed')).toThrow(/knowledge\.required.*unknown/);
  });

  it('fails when required knowledge points to an inactive document', () => {
    const root = fixture();
    writeIndex(root, 'superseded');
    expect(() => buildAgents(root, ['claude'], 'embed')).toThrow(
      /knowledge\.required.*inactive.*superseded/,
    );
  });

  it('partial provider builds do not delete generated skills from another provider root', () => {
    const root = fixture();
    buildAgents(root, ['claude', 'codex'], 'embed');
    const codex = join(root, '.agents/skills/nevo-agents-implementer/SKILL.md');
    buildAgents(root, ['claude'], 'embed');
    expect(readFileSync(codex, 'utf8')).toContain('nevo-agents-implementer');
  });

  it('validates provider lists', () => {
    expect(parseProviders('claude,codex')).toEqual(['claude', 'codex']);
    expect(() => parseProviders('claude,unknown')).toThrow(/unknown provider/);
  });
});
