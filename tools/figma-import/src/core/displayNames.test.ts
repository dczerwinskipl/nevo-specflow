import { describe, expect, it } from 'vitest';
import { humanizeDisplayName, slotDisplayName } from './displayNames';

describe('Figma display names', () => {
  it.each([
    ['body', 'Body'],
    ['leadingIcon', 'Leading icon'],
    ['session_actions', 'Session actions'],
    ['slot:content', 'Slot content'],
  ])('humanizes %s without changing identity data', (source, expected) => {
    expect(humanizeDisplayName(source)).toBe(expected);
  });

  it('allows an explicit human-facing name independent from the slot key', () => {
    expect(slotDisplayName('internalTrigger', 'Trigger')).toBe('Trigger');
  });
});
