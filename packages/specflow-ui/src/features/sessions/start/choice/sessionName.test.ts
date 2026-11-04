import { describe, expect, it } from 'vitest';
import {
  chosenSessionName,
  initialSessionName,
  sessionNameMaxLength,
  sessionNameMissing,
} from './sessionName';

describe('session name choice', () => {
  it('lets the agent name the Session by default', () => {
    expect(initialSessionName).toEqual({ mode: 'agent', value: '' });
    expect(chosenSessionName(initialSessionName)).toBeUndefined();
    expect(sessionNameMissing(initialSessionName)).toBe(false);
  });

  it('uses the trimmed own name only while the own name is chosen', () => {
    expect(chosenSessionName({ mode: 'custom', value: '  Review SSO ' })).toBe('Review SSO');
    expect(chosenSessionName({ mode: 'agent', value: 'Review SSO' })).toBeUndefined();
  });

  it('treats a blank own name as missing', () => {
    expect(sessionNameMissing({ mode: 'custom', value: '   ' })).toBe(true);
    expect(chosenSessionName({ mode: 'custom', value: '   ' })).toBeUndefined();
  });

  it('follows the 256-character limit of the Session title contract', () => {
    expect(sessionNameMaxLength).toBe(256);
  });
});
