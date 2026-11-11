import { describe, expect, it } from 'vitest';

import { EXCERPT_MAX_CHARS, excerpt } from './excerpt';

const filler = (count: number) =>
  Array.from({ length: count }, (_, index) => `Filler sentence ${index} says nothing.`).join(' ');

describe('excerpt', () => {
  it('shows the sentences around the best match, not the section start', () => {
    const section = `## Locks\n\n${filler(12)} A stale writer lock is reclaimed after the owner died. ${filler(12)}`;
    const text = excerpt(section, 'how is a stale lock reclaimed');

    expect(text).toContain('A stale writer lock is reclaimed after the owner died.');
    expect(text.startsWith('…')).toBe(true);
    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(EXCERPT_MAX_CHARS);
  });

  it('matches inflected words by prefix and keeps table rows whole, without the rule', () => {
    const section = [
      '## Routes',
      'Every route is listed below.',
      '',
      '| Route | Purpose |',
      '| ----- | ------- |',
      '| `GET /api/tasks` | Reads the taskami of a workspace |',
      '| `GET /api/docs` | Reads documents |',
    ].join('\n');

    const text = excerpt(section, 'taski');
    expect(text).toContain('| `GET /api/tasks` | Reads the taskami of a workspace |');
    expect(text).not.toContain('-----');
  });

  it('falls back to the first sentences after the heading without a matching word', () => {
    const section = `# Guide\n\nInstall the widget with pnpm. ${filler(20)}`;
    const text = excerpt(section, 'zupełnie inne pytanie');

    expect(text.startsWith('Install the widget with pnpm.')).toBe(true);
    expect(text.endsWith('…')).toBe(true);
  });

  it('cuts an over-long piece around its first matching word', () => {
    const words = Array.from({ length: 120 }, (_, index) => `word${index}`).join(' ');
    const text = excerpt(`## Long\n${words} needle ${words}.`, 'needle');

    expect(text).toContain('needle');
    expect(text.startsWith('…')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(EXCERPT_MAX_CHARS);
  });
});
