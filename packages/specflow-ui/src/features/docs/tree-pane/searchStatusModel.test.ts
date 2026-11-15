import { beforeAll, describe, expect, it } from 'vitest';
import type { WorkspaceDocsSearch } from '@nevo/specflow-contracts/docs';
import { appI18n } from '../../../i18n';
import {
  answerAnnouncement,
  answerLines,
  noWordMatch,
  preparesSearchByMeaning,
  reasonLine,
} from './searchStatusModel';

const t = appI18n.t;

const hit = (id: string, wordMatch: boolean) => ({
  id,
  title: id,
  type: 'reference',
  status: 'current',
  file: `${id}.md`,
  score: 1,
  wordMatch,
  sections: [],
});

const envelope = (wordMatches: boolean[]) => ({
  workspaceId: 'ws',
  corpusRevision: 'rev',
  results: wordMatches.map((match, index) => hit(`doc-${index}`, match)),
  proposalsLeftOut: 0,
  skipped: [],
});

const hybrid = (wordMatches: boolean[]): WorkspaceDocsSearch => ({
  mode: 'hybrid',
  ...envelope(wordMatches),
});

const lexical = (
  code:
    | 'semantic-disabled'
    | 'no-endpoint'
    | 'endpoint-unreachable'
    | 'index-building'
    | 'index-unavailable',
  extra: Partial<WorkspaceDocsSearch> = {},
): WorkspaceDocsSearch => ({
  mode: 'lexical',
  reason: { code, message: '' },
  ...envelope([true, true]),
  ...extra,
});

beforeAll(async () => {
  await appI18n.changeLanguage('en');
});

describe('reasonLine', () => {
  it('says why a word-only answer has word matches only, silent for configuration', () => {
    expect(reasonLine(t, lexical('index-building'))).toBe(
      'Word matches only for now: the search index is being built.',
    );
    expect(
      reasonLine(t, lexical('index-building', { indexProgress: { embedded: 62, total: 100 } })),
    ).toBe('Word matches only for now: the search index is being built (62%).');
    expect(reasonLine(t, lexical('endpoint-unreachable'))).toBe(
      'Word matches only: search by meaning is unavailable.',
    );
    expect(reasonLine(t, lexical('index-unavailable'))).toBe(
      'Word matches only: the search index is unavailable.',
    );
    expect(reasonLine(t, lexical('semantic-disabled'))).toBeUndefined();
    expect(reasonLine(t, lexical('no-endpoint'))).toBeUndefined();
    expect(reasonLine(t, hybrid([true]))).toBeUndefined();
  });
});

describe('preparesSearchByMeaning', () => {
  it('holds unless search by meaning is off by configuration', () => {
    expect(preparesSearchByMeaning(undefined)).toBe(true);
    expect(preparesSearchByMeaning(hybrid([true]))).toBe(true);
    expect(preparesSearchByMeaning(lexical('index-building'))).toBe(true);
    expect(preparesSearchByMeaning(lexical('endpoint-unreachable'))).toBe(true);
    expect(preparesSearchByMeaning(lexical('index-unavailable'))).toBe(true);
    expect(preparesSearchByMeaning(lexical('semantic-disabled'))).toBe(false);
    expect(preparesSearchByMeaning(lexical('no-endpoint'))).toBe(false);
  });
});

describe('noWordMatch', () => {
  it('holds only for a hybrid answer none of whose results matched a word', () => {
    expect(noWordMatch(hybrid([false, false]))).toBe(true);
    expect(noWordMatch(hybrid([false, true]))).toBe(false);
    expect(noWordMatch(hybrid([]))).toBe(false);
    expect(noWordMatch(lexical('semantic-disabled'))).toBe(false);
  });
});

describe('the lines and the announcement of a settled answer', () => {
  it('reads the count alone when there is no line', () => {
    expect(answerLines(t, hybrid([true]))).toEqual([]);
    expect(answerAnnouncement(t, hybrid([true]))).toBe('1 result');
    expect(answerAnnouncement(t, hybrid([true, false, true]))).toBe('3 results');
  });

  it('reads the count together with the lines', () => {
    expect(answerAnnouncement(t, hybrid([false, false]))).toBe(
      '2 results. No word matches. Below are results of search by meaning.',
    );
    expect(answerAnnouncement(t, lexical('endpoint-unreachable'))).toBe(
      '2 results. Word matches only: search by meaning is unavailable.',
    );
  });

  it('says that nothing matches, with the reason', () => {
    expect(answerAnnouncement(t, lexical('index-unavailable', { results: [] }))).toBe(
      'No matching documents. Word matches only: the search index is unavailable.',
    );
    expect(answerAnnouncement(t, hybrid([]))).toBe('No matching documents');
  });

  it('uses the Polish plural forms', async () => {
    await appI18n.changeLanguage('pl');
    try {
      expect(answerAnnouncement(t, hybrid([true]))).toBe('1 wynik');
      expect(answerAnnouncement(t, hybrid([true, true, true]))).toBe('3 wyniki');
      expect(answerAnnouncement(t, hybrid([true, true, true, true, true]))).toBe('5 wyników');
    } finally {
      await appI18n.changeLanguage('en');
    }
  });
});
