import { describe, expect, it } from 'vitest';
import {
  chosenSessionName,
  initialSessionName,
  sessionNameFrom,
  sessionNameMaxLength,
} from './sessionName';

describe('session name choice', () => {
  it('lets the agent name the Session by default', () => {
    expect(initialSessionName).toEqual({ mode: 'agent', value: '' });
    expect(chosenSessionName(initialSessionName)).toBeUndefined();
  });

  it('uses the trimmed own name only while the own name is chosen', () => {
    expect(chosenSessionName({ mode: 'custom', value: '  Review SSO ' })).toBe('Review SSO');
    expect(chosenSessionName({ mode: 'agent', value: 'Review SSO' })).toBeUndefined();
  });

  it('chooses an own name once the optional field holds one, else lets the agent name it', () => {
    expect(sessionNameFrom('Review SSO')).toEqual({ mode: 'custom', value: 'Review SSO' });
    expect(sessionNameFrom('   ')).toEqual({ mode: 'agent', value: '   ' });
    expect(chosenSessionName(sessionNameFrom('   '))).toBeUndefined();
    expect(chosenSessionName(sessionNameFrom(' Review SSO '))).toBe('Review SSO');
  });

  it('follows the 256-character limit of the Session title contract', () => {
    expect(sessionNameMaxLength).toBe(256);
  });
});
