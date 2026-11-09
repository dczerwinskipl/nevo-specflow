import { describe, expect, it } from 'vitest';
import { createSpecFlowI18n } from '../../../i18n/i18n';
import { sessionAgentFact, sessionRowFacts, sessionRowStatus } from './sessionRow';

const pl = createSpecFlowI18n('pl').t;
const en = createSpecFlowI18n('en').t;
const now = Date.parse('2026-11-08T12:00:00.000Z');
const claude = {
  providerId: 'claude',
  providerTitle: 'Claude',
  modelId: 'claude-opus-4-1',
  modelTitle: 'Opus 4.1',
};

describe('Session row facts', () => {
  it('names the model visibly and the provider with the model for assistive technology', () => {
    expect(sessionAgentFact(claude, pl)).toEqual({
      text: 'Opus 4.1',
      accessibleText: 'Claude, model Opus 4.1',
      maxWidth: '16rem',
    });
    expect(sessionAgentFact(claude, en)).toMatchObject({
      accessibleText: 'Claude, model Opus 4.1',
    });
  });

  it('falls back to the raw model id, then to the provider title or id', () => {
    // A provider or model no longer listed: no titles from the Runtime.
    expect(sessionAgentFact({ providerId: 'retired', modelId: 'model-x' }, pl)).toEqual({
      text: 'model-x',
      accessibleText: 'retired, model model-x',
      maxWidth: '16rem',
    });
    expect(sessionAgentFact({ providerId: 'claude', providerTitle: 'Claude' }, pl)).toEqual({
      text: 'Claude',
      maxWidth: '16rem',
    });
    expect(sessionAgentFact({ providerId: 'retired' }, pl)).toEqual({
      text: 'retired',
      maxWidth: '16rem',
    });
  });

  it('orders age, agent and Tasks, omitting every absent fact', () => {
    const updatedAt = '2026-11-08T11:55:00.000Z';
    const facts = sessionRowFacts({ updatedAt, agent: claude, taskCount: 3 }, pl, now, 'pl');
    expect(facts.map((fact) => (typeof fact === 'string' ? fact : fact.text))).toEqual([
      '5 minut temu',
      'Opus 4.1',
      '3 zadania',
    ]);
    expect(facts[2]).toMatchObject({ accessibleText: 'Powiązana z 3 zadaniami' });
    expect(sessionRowFacts({ updatedAt, agent: claude, taskCount: 0 }, pl, now, 'pl')).toHaveLength(
      2,
    );
    expect(sessionRowFacts({ agent: undefined, taskCount: 1 }, pl, now, 'pl')).toEqual([
      { text: '1 zadanie', accessibleText: 'Powiązana z 1 zadaniem' },
    ]);
  });
});

describe('Session row status', () => {
  it('shows effective readiness only, a sign-in muted and naming the provider', () => {
    expect(sessionRowStatus('ready', claude, pl)).toBeUndefined();
    expect(sessionRowStatus('busy', claude, pl)).toMatchObject({ text: 'Aktywna', tone: 'info' });
    expect(sessionRowStatus('requiresAttention', claude, pl)).toMatchObject({
      text: 'Wymaga uwagi',
      tone: 'attention',
      icon: 'triangle-alert',
    });
    expect(sessionRowStatus('authenticationRequired', claude, pl)).toEqual({
      text: 'Claude: wymagane ponowne logowanie',
      textClassName: 'text-content-muted',
    });
    expect(sessionRowStatus('authenticationRequired', { providerId: 'codex' }, en)).toEqual({
      text: 'codex: sign-in required',
      textClassName: 'text-content-muted',
    });
    expect(sessionRowStatus('unavailable', claude, pl)).toEqual({
      text: 'Stan sesji nieznany',
      textClassName: 'text-content-muted',
    });
  });
});
