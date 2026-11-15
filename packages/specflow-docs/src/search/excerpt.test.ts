import { describe, expect, it } from 'vitest';

import { EXCERPT_LEAD_CHARS, EXCERPT_MAX_CHARS, excerpt } from './excerpt';

const filler = (count: number) =>
  Array.from({ length: count }, (_, index) => `Filler sentence ${index} says nothing.`).join(' ');

/** The marked words of an excerpt. */
const marked = (section: string, query: string) => {
  const { text, matches } = excerpt(section, query);

  return matches.map(({ start, end }) => text.slice(start, end));
};

describe('excerpt', () => {
  it.each([
    {
      name: 'a sentence run of one paragraph, not glued to the next paragraph',
      section:
        '## Locks\n\nThe index has one writer. A stale lock is reclaimed.\n\nOther paragraph.',
      query: 'writer',
      text: 'The index has one writer. A stale lock is reclaimed.',
    },
    {
      name: 'one list item, continuation line included, without its marker',
      section: '## Steps\n\n- Install the widget\n  with pnpm.\n- Configure the endpoint.',
      query: 'install',
      text: 'Install the widget with pnpm.',
    },
    {
      name: 'a table row in readable form, the header row and the rule dropped',
      section: [
        '## Outcomes',
        '',
        '| Outcome | Termination | Continuation |',
        '| ------- | ----------- | ------------ |',
        '| Cancellation, error | allow termination | disable `continue` |',
        '| Success | n/a | allow \\| retry |',
      ].join('\n'),
      query: 'cancellation',
      text: 'Cancellation, error — allow termination; disable continue',
    },
    {
      name: 'a prose sentence over a code path that also matches',
      section:
        '## Claude\n\nCode: `features/sessions/providers/claude/`.\n\nClaude runs through the shared Session coordinator.',
      query: 'claude',
      text: 'Claude runs through the shared Session coordinator.',
    },
    {
      name: 'a fenced code line only when no prose matches',
      section: '## Run\n\nRun it as shown.\n\n```bash\npnpm docs:search "excerpt"\n```',
      query: 'pnpm',
      text: 'pnpm docs:search "excerpt"',
    },
    {
      name: 'prose that holds a single code span stays prose',
      section:
        '## Search\n\n`docs.search.semantic`\n\nSet `docs.search.semantic` to true to enable search by meaning.',
      query: 'semantic',
      text: 'Set docs.search.semantic to true to enable search by meaning.',
    },
    {
      name: 'no Markdown left: links, emphasis, images, HTML and escapes',
      section:
        '## Links\n\nRead the **[workspace docs](../api/workspace-docs.md)** _first_, see ![the diagram](d.png) <br> and \\*not\\* <kbd>Ctrl</kbd> &amp; more.',
      query: 'workspace',
      text: 'Read the workspace docs first, see the diagram and *not* Ctrl & more.',
    },
    {
      name: 'no tag rebuilt from nested tags',
      section: '## Tags\n\nThe widget <<b>script>alert(1)<</b>/script> renders safely.',
      query: 'widget',
      text: 'The widget alert(1) renders safely.',
    },
    {
      name: 'the longest prose fragment when no word matches',
      section:
        '## Guide\n\nShort intro.\n\nThe widget is installed with pnpm and configured once per project.\n\n```\nlonger code line that is not prose at all here\n```',
      query: 'zzzqqq',
      text: 'The widget is installed with pnpm and configured once per project.',
    },
  ])('shows $name', ({ section, query, text }) => {
    expect(excerpt(section, query).text).toBe(text);
  });

  it('starts at a sentence start within the lead, without an ellipsis', () => {
    const section = `## Locks\n\n${filler(3)} When the owner died, a stale lock is reclaimed. ${filler(9)}`;
    const { text } = excerpt(section, 'stale');

    expect(text.startsWith('When the owner died, a stale lock is reclaimed. Filler')).toBe(true);
    // It ends at a sentence end that fits, so no trailing ellipsis.
    expect(text.endsWith('.')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(EXCERPT_MAX_CHARS);
  });

  it('cuts a far start as "… " and a whole word, at most the lead before the match', () => {
    const before = 'The writer lock of the semantic index is held by one process at a time, and';
    const section = `## Locks\n\n${before} the Engine reclaims a stale lock after its owner died.`;
    const { text, matches } = excerpt(section, 'reclaims');

    expect(text.startsWith('… ')).toBe(true);
    expect(text).not.toMatch(/^…\S/u);
    expect(`${before} the Engine`).toContain(text.slice(2, text.indexOf(' reclaims')));
    expect(before.split(' ')).toContain(text.slice(2).split(' ')[0]);
    expect(matches[0]!.start).toBeLessThanOrEqual(EXCERPT_LEAD_CHARS);
    expect(text.endsWith('died.')).toBe(true);
  });

  it('ends with "…" only when cut inside a sentence, within the maximum', () => {
    const words = Array.from({ length: 120 }, (_, index) => `word${index}`).join(' ');
    const { text } = excerpt(`## Long\nThe needle ${words}.`, 'needle');

    expect(text.startsWith('The needle word0')).toBe(true);
    expect(text.endsWith('…')).toBe(true);
    expect(text).not.toMatch(/\s…$/u);
    expect(text.length).toBeLessThanOrEqual(EXCERPT_MAX_CHARS);
  });

  it('cuts a text without spaces on a grapheme boundary, never inside a surrogate pair', () => {
    // "needle" and 200 two-unit emoji: a cut at 279 code units would split one.
    const { text } = excerpt(`## Long\nneedle${'😀'.repeat(200)}`, 'needle');

    expect(text.endsWith('😀…')).toBe(true);
    expect(() => encodeURIComponent(text)).not.toThrow();
    expect(text.length).toBeLessThanOrEqual(EXCERPT_MAX_CHARS);
  });

  it('marks the first occurrence of each term, at most three, by prefix and across folding', () => {
    expect(
      marked('## S\n\nSessions start a session; the Engine owns sessions.', 'session engine'),
    ).toEqual(['Sessions', 'Engine']);
    expect(
      marked('## S\n\nOne two three four five, one two three four five.', 'one two three four'),
    ).toEqual(['One', 'two', 'three']);
    expect(marked('## P\n\nObsługa PŁATNOŚCI i płatności kartą.', 'platnosci')).toEqual([
      'PŁATNOŚCI',
    ]);
    // Decomposed letters keep their combining marks inside the range.
    expect(marked('## P\n\nCafé au lait.', 'cafe')).toEqual(['Café']);
    expect(marked('## P\n\nDie Straße ist lang.', 'strasse')).toEqual(['Straße']);
    expect(excerpt('## P\n\nNothing relevant here.', 'zzzqqq').matches).toEqual([]);
  });

  it('places the ranges on the final text, after a cut and stripped Markdown', () => {
    const section = `## Locks\n\n${'Lorem ipsum dolor sit amet consectetur '.repeat(2)}the **[Engine](x.md)** reclaims \`locks\`.`;
    const { text, matches } = excerpt(section, 'engine locks');

    expect(matches.map(({ start, end }) => text.slice(start, end))).toEqual(['Engine', 'locks']);
  });
});
