import type { DocRecord } from '@nevo/specflow-docs';
import { describe, expect, it } from 'vitest';

import { validateMermaidBlockIds } from '../../src/domain/mermaid-block-ids.js';

const tick = '```';
const fence = (body: string): string => [tick + 'mermaid', body, tick].join('\n');
const doc = (body: string): DocRecord => ({
  id: 'architecture.example',
  type: 'architecture',
  file: 'docs/architecture/example.md',
  status: 'current',
  body,
});

describe('validateMermaidBlockIds', () => {
  it('rejects a block and node sharing the same ID (overview regression)', () => {
    const body = fence(
      [
        'block-beta',
        '  columns 1',
        '  block:engine',
        '    columns 2',
        '    title["SpecFlow Engine"]:2',
        '    engine["SpecFlow Engine"]',
        '    operations["Specifications"]',
        '  end',
      ].join('\n'),
    );
    expect(validateMermaidBlockIds([doc(body)])).toEqual([
      expect.stringContaining(
        "identifier 'engine' is reused (block at diagram line 3; node at line 6)",
      ),
    ]);
  });

  it('rejects repeated nodes and repeated blocks', () => {
    const body = fence(
      [
        'block-beta',
        '  block:first',
        '    x["One"]',
        '    x["Two"]',
        '  end',
        '  block:first',
        '  end',
      ].join('\n'),
    );
    const issues = validateMermaidBlockIds([doc(body)]);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain("identifier 'x' is reused");
    expect(issues[1]).toContain("identifier 'first' is reused");
  });

  it('allows IDs to repeat across diagrams and accepts column spans', () => {
    const valid = [
      'block-beta',
      '  block:engine',
      '    columns 2',
      '    heading["Engine"]:2',
      '    engineComponent["Engine"]',
      '    tasks["Tasks"]',
      '  end',
    ].join('\n');
    expect(validateMermaidBlockIds([doc(fence(valid) + '\n\n' + fence(valid))])).toEqual([]);
  });

  it('ignores flowchart reuse and embedded samples inside other code fences', () => {
    const flow = fence('flowchart TD\n  engine["Engine"] --> engine["Engine"]');
    const example = [
      tick + '`' + 'markdown',
      tick + 'mermaid',
      'block-beta',
      '  block:engine',
      '    engine["Engine"]',
      '  end',
      tick,
      tick + '`',
    ].join('\n');
    expect(validateMermaidBlockIds([doc(flow + '\n\n' + example)])).toEqual([]);
  });

  it('finds collisions in tilde-fenced diagrams and ignores repeated spacers', () => {
    const body = [
      '~~~mermaid',
      'block-beta',
      '  block:root',
      '    space:2',
      '    space:1',
      '    root["Collision"]',
      '  end',
      '~~~',
    ].join('\n');
    expect(validateMermaidBlockIds([doc(body)])).toEqual([
      expect.stringContaining("identifier 'root' is reused"),
    ]);
  });
});
