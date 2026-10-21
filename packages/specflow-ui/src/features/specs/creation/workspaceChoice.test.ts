import { describe, expect, it } from 'vitest';
import {
  createOptionsFixture,
  workspaceIds as ids,
  type OptionsVariant,
} from './creationOptions.stories-support';
import { polishText } from '../../../i18n/testing';
import {
  activeTile,
  branchNameError as rawBranchNameError,
  buildCreateRequest,
  buildCreateTarget,
  defaultBaseValue,
  defaultTile,
  effectiveTargetBranch,
  formatOperationTime as rawFormatOperationTime,
  inheritedTarget,
  initialWorkspaceChoice,
  mergeSuggestion,
  operationStageLabel as rawOperationStageLabel,
  problems as rawProblems,
  requestChoiceSnapshot,
  revalidate as rawRevalidate,
  settingsSummary as rawSettingsSummary,
  sharedUseNote as rawSharedUseNote,
  specCountLabel as rawSpecCountLabel,
  targetStatus,
  tileAvailability as rawTileAvailability,
  type WorkspaceChoice,
} from './workspaceChoice';

// The policy returns catalogue messages; these tests assert the Polish text they render to.
const branchNameError = (...args: Parameters<typeof rawBranchNameError>) =>
  polishText(rawBranchNameError(...args));
const problems = (...args: Parameters<typeof rawProblems>) =>
  rawProblems(...args).map((entry) => polishText(entry));
const revalidate = (...args: Parameters<typeof rawRevalidate>) =>
  Object.fromEntries(
    Object.entries(rawRevalidate(...args)).map(([key, entry]) => [key, polishText(entry)]),
  ) as Partial<Record<'tile' | 'existing' | 'base' | 'target' | 'branch', string>>;
const tileAvailability = (...args: Parameters<typeof rawTileAvailability>) =>
  Object.fromEntries(
    Object.entries(rawTileAvailability(...args)).map(([tile, entry]) => [
      tile,
      { ...entry, reason: polishText(entry.reason) },
    ]),
  ) as Record<'new' | 'main' | 'existing', { ok: boolean; reason?: string; count?: number }>;
const settingsSummary = (...args: Parameters<typeof rawSettingsSummary>) =>
  polishText(rawSettingsSummary(...args));
const specCountLabel = (count: number) => polishText(rawSpecCountLabel(count));
const sharedUseNote = (count: number, place: 'workspace' | 'katalog') =>
  polishText(rawSharedUseNote(count, place === 'katalog' ? 'folder' : 'workspace'));
const operationStageLabel = (step: string) => polishText(rawOperationStageLabel(step));
const formatOperationTime = (iso: string) => rawFormatOperationTime(iso, 'pl-PL');

const options = (variant?: OptionsVariant) => createOptionsFixture(variant);
const choice = (patch: Partial<WorkspaceChoice> = {}): WorkspaceChoice => ({
  ...initialWorkspaceChoice,
  ...patch,
});
const op = '7f3a91c2-4b6e-4d1a-9c0e-2f5a1b8d3e77';

describe('tileAvailability', () => {
  it('everything available in the default seed', () => {
    expect(tileAvailability(options())).toEqual({
      new: { ok: true },
      main: { ok: true },
      existing: { ok: true, count: 3 },
    });
  });
  it.each([
    ['git-disabled', 'Wyłączone w konfiguracji projektu.'],
    ['git-unavailable', 'Git jest teraz niedostępny.'],
    ['membership-mismatch', 'Ten katalog nie należy do repozytorium projektu.'],
  ] as const)('new worktree %s explains itself', (variant, reason) => {
    expect(tileAvailability(options(variant)).new).toEqual({ ok: false, reason });
  });
  it('checkout-unavailable reason of the new worktree', () => {
    const value = options();
    value.newWorktree = { status: 'unavailable', reason: 'checkout-unavailable' };
    expect(tileAvailability(value).new.reason).toBe('Katalog projektu jest teraz niedostępny.');
  });
  it('main follows the primary workspace', () => {
    expect(tileAvailability(options('primary-detached')).main).toEqual({
      ok: false,
      reason: 'W bieżącym katalogu nie wybrano gałęzi (odłączony stan).',
    });
    expect(tileAvailability(options('none-available')).main.reason).toBe(
      'Bieżący katalog jest niedostępny.',
    );
    expect(tileAvailability(options('primary-dirty')).main.ok).toBe(true);
  });
  it('existing distinguishes no linked workspace from none selectable', () => {
    expect(tileAvailability(options('no-linked')).existing.reason).toBe(
      'Brak innych środowisk pracy w projekcie.',
    );
    expect(tileAvailability(options('linked-none-selectable')).existing.reason).toBe(
      'Żadne środowisko pracy nie jest teraz dostępne.',
    );
  });
});

describe('defaultTile', () => {
  it('prefers new, then main, then existing, else nothing', () => {
    expect(defaultTile(options())).toBe('new');
    expect(defaultTile(options('git-disabled'))).toBe('main');
    const mainBlocked = options('primary-detached');
    mainBlocked.newWorktree = { status: 'unavailable', reason: 'git-unavailable' };
    expect(defaultTile(mainBlocked)).toBe('existing');
    expect(defaultTile(options('none-available'))).toBeNull();
  });
  it('an untouched choice follows the options, a touched one never jumps', () => {
    expect(activeTile(choice(), options('git-disabled'))).toBe('main');
    expect(activeTile(choice({ tile: 'new' }), options('git-disabled'))).toBe('new');
  });
});

describe('buildCreateRequest', () => {
  it('main has no target and no overrides, even when other tiles hold values', () => {
    const remembered = choice({
      tile: 'main',
      base: { on: true, ref: 'feature/platform' },
      target: { on: true, workspaceId: ids.platform },
      branch: { on: true, name: 'feature/x' },
      existingWorkspaceId: ids.platform,
    });
    expect(buildCreateRequest(remembered, options(), '  Płatności ', op)).toEqual({
      title: 'Płatności',
      operationId: op,
    });
  });
  it('existing sends only the workspace', () => {
    const request = buildCreateRequest(
      choice({
        tile: 'existing',
        existingWorkspaceId: ids.platform,
        base: { on: true, ref: 'main' },
        branch: { on: true, name: 'x' },
      }),
      options(),
      'T',
      op,
    );
    expect(request.target).toEqual({ kind: 'existing', workspaceId: ids.platform });
  });
  it('default new workspace is {kind: new-worktree} with no baseRef, branch or target', () => {
    const request = buildCreateRequest(choice(), options(), 'T', op);
    expect(request.target).toEqual({ kind: 'new-worktree' });
    expect(Object.keys(request.target!)).toEqual(['kind']);
  });
  it('a disabled switch sends nothing even when its value is remembered', () => {
    const target = buildCreateTarget(
      choice({
        tile: 'new',
        base: { on: false, ref: 'feature/platform' },
        target: { on: false, workspaceId: ids.platform },
        branch: { on: false, name: 'feature/x' },
      }),
      options(),
    );
    expect(target).toEqual({ kind: 'new-worktree' });
  });
  it.each([
    [{ base: true, target: false, branch: false }],
    [{ base: false, target: true, branch: false }],
    [{ base: false, target: false, branch: true }],
    [{ base: true, target: true, branch: false }],
    [{ base: true, target: false, branch: true }],
    [{ base: false, target: true, branch: true }],
    [{ base: true, target: true, branch: true }],
  ])('every switch combination %j sends exactly the enabled overrides', (on) => {
    const target = buildCreateTarget(
      choice({
        tile: 'new',
        base: { on: on.base, ref: 'feature/platform' },
        target: { on: on.target, workspaceId: ids.architecture },
        branch: { on: on.branch, name: ' feature/payments-v2 ' },
      }),
      options(),
    );
    expect(target).toEqual({
      kind: 'new-worktree',
      ...(on.base ? { baseRef: 'feature/platform' } : {}),
      ...(on.branch ? { branch: 'feature/payments-v2' } : {}),
      ...(on.target ? { integrationTargetWorkspaceId: ids.architecture } : {}),
    });
  });
  it('sends a base equal to the default as chosen, and never hard-codes main or develop', () => {
    const target = buildCreateTarget(
      choice({ tile: 'new', base: { on: true, ref: 'develop' } }),
      options(),
    );
    expect(target).toEqual({ kind: 'new-worktree', baseRef: 'develop' });
    expect(JSON.stringify(buildCreateTarget(choice(), options()))).not.toMatch(/develop|main/);
  });
  it('an enabled switch without a value sends nothing and blocks Create', () => {
    const pending = choice({ tile: 'new', base: { on: true, ref: '' } });
    expect(buildCreateTarget(pending, options())).toEqual({ kind: 'new-worktree' });
    expect(problems(pending, options())).toEqual(['Wybierz gałąź początkową lub wyłącz tę opcję.']);
    expect(
      problems(choice({ tile: 'new', target: { on: true, workspaceId: '' } }), options()),
    ).toEqual(['Wybierz cel scalenia lub wyłącz tę opcję.']);
  });
  it('changing tiles keeps remembered values and a round trip restores the same request', () => {
    const configured = choice({
      tile: 'new',
      base: { on: true, ref: 'feature/platform' },
      branch: { on: true, name: 'feature/payments-v2' },
    });
    const first = buildCreateTarget(configured, options());
    const away = { ...configured, tile: 'main' as const };
    expect(buildCreateTarget(away, options())).toBeUndefined();
    expect(away.base).toEqual(configured.base);
    expect(buildCreateTarget({ ...away, tile: 'new' }, options())).toEqual(first);
  });
});

describe('branchNameError', () => {
  it.each(['', '   '])('asks for a name when %j', (name) =>
    expect(branchNameError(name, options())).toBe('Wpisz nazwę gałęzi lub wyłącz tę opcję.'),
  );
  const characters = 'Nazwa gałęzi zawiera niedozwolone znaki. Użyj liter, cyfr, „-”, „_” i „/”.';
  it.each(['bad name', 'a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\b', 'tab	name'])(
    'names the characters when %j has an illegal one',
    (name) => expect(branchNameError(name, options())).toBe(characters),
  );
  // F-07: every character is legal, only the structure is wrong, so the message must say so.
  it.each(['feature//x', 'a..b', 'a@{b', '/a', 'a/', '-a', '@', 'x.lock', 'a/.hidden', 'a.'])(
    'names the structure when %j has only legal characters',
    (name) => {
      const message = branchNameError(name, options());
      expect(message).toContain('niedozwolony układ');
      expect(message).not.toBe(characters);
    },
  );
  it('rejects an over-long name with its own message', () =>
    expect(branchNameError('x'.repeat(201), options())).toBe('Nazwa gałęzi jest zbyt długa.'));
  it('rejects a collision with a local branch or a workspace branch', () => {
    expect(branchNameError('feature/platform', options())).toBe(
      'Gałąź o tej nazwie już istnieje. Wpisz inną nazwę.',
    );
    expect(branchNameError('release/1.4', options())).toContain('już istnieje');
  });
  it('accepts a valid free name', () => {
    expect(branchNameError('feature/payments-v2', options())).toBeUndefined();
  });
});

describe('targetStatus: the project default target is realised by the PRIMARY workspace', () => {
  it('is ok when the primary workspace is clean on the configured branch', () => {
    expect(targetStatus(options())).toMatchObject({ kind: 'ok', branch: 'develop' });
  });
  it('is unavailable when the primary workspace is on the branch but dirty', () => {
    expect(targetStatus(options('target-dirty'))).toMatchObject({
      kind: 'unavailable',
      branch: 'develop',
    });
  });
  it('is NOT ok when only a linked workspace sits on the configured branch (Close would refuse)', () => {
    const value = options('primary-other-branch');
    // A clean, integration-selectable linked workspace is on the target branch ...
    expect(
      value.workspaces.find((w) => w.branch === 'develop' && w.kind === 'linked'),
    ).toMatchObject({ integrationSelectable: true });
    // ... yet the default target is unavailable because the primary is elsewhere.
    expect(targetStatus(value)).toMatchObject({ kind: 'other-branch', branch: 'develop' });
  });
  it('is other-branch for a detached primary and for a branch nobody holds', () => {
    expect(targetStatus(options('primary-detached'))).toMatchObject({ kind: 'other-branch' });
    const value = options();
    value.integrationTargetBranch = 'release/9';
    expect(targetStatus(value)).toMatchObject({ kind: 'other-branch', branch: 'release/9' });
  });
  it('is none without a configured target', () => {
    expect(targetStatus(options('no-integration-target'))).toEqual({ kind: 'none' });
  });
});

describe('inheritedTarget (Existing tile)', () => {
  const find = (value: ReturnType<typeof options>, id: string) =>
    value.workspaces.find((w) => w.workspaceId === id)!;
  it('shows the pin of the workspace itself as a pinned branch', () => {
    const value = options();
    expect(inheritedTarget(value, find(value, ids.payments))).toEqual({
      kind: 'pinned',
      branch: 'develop',
    });
  });
  it('falls back to the project target, without any availability claim, when there is no pin', () => {
    const value = options();
    expect(inheritedTarget(value, find(value, ids.platform))).toEqual({
      kind: 'project',
      branch: 'develop',
    });
    const dirtyPrimary = options('primary-dirty');
    expect(inheritedTarget(dirtyPrimary, find(dirtyPrimary, ids.platform))).toEqual({
      kind: 'project',
      branch: 'develop',
    });
  });
  it('shows nothing without a pin and without a configured project target', () => {
    const value = options('no-integration-target');
    expect(inheritedTarget(value, find(value, ids.platform))).toEqual({ kind: 'none' });
  });
  it('never takes a pin from the branch name of another workspace', () => {
    const value = options('primary-other-branch');
    expect(inheritedTarget(value, find(value, ids.architecture))).toEqual({
      kind: 'project',
      branch: 'develop',
    });
  });
  it('flags a pin whose target changed branch or is no longer selectable', () => {
    const drift = options('pin-drift');
    expect(inheritedTarget(drift, find(drift, ids.payments))).toEqual({
      kind: 'pinned',
      branch: 'release/1.3',
      drift: 'branch-changed',
    });
    const dirty = options('primary-dirty');
    expect(inheritedTarget(dirty, find(dirty, ids.payments))).toEqual({
      kind: 'pinned',
      branch: 'develop',
      drift: 'unavailable',
    });
  });
});

describe('revalidate keeps values and flags them', () => {
  const remembered = choice({
    tile: 'main',
    base: { on: true, ref: 'feature/platform' },
    target: { on: true, workspaceId: ids.platform },
    branch: { on: true, name: 'feature/payments-v2' },
    existingWorkspaceId: ids.platform,
  });
  it('is clean for current options', () => {
    expect(revalidate(remembered, options())).toEqual({});
  });
  it('flags a removed ref, a target that became dirty and a vanished workspace', () => {
    const stale = options('platform-dirty');
    stale.baseRefs = stale.baseRefs.filter((b) => b.ref !== 'feature/platform');
    const errors = revalidate(remembered, stale);
    expect(errors.base).toContain('nie jest już dostępna');
    expect(errors.target).toContain('nie może już być celem scalenia');
    const gone = options();
    gone.workspaces = gone.workspaces.filter((w) => w.workspaceId !== ids.platform);
    expect(revalidate(remembered, gone).existing).toBe(
      'To środowisko pracy nie jest już dostępne.',
    );
  });
  it('flags a custom name that has become taken', () => {
    const taken = options();
    taken.baseRefs.push({ ref: 'feature/payments-v2' });
    expect(revalidate(remembered, taken).branch).toContain('już istnieje');
  });
  it('inactive tile values never block Create', () => {
    const stale = options();
    stale.baseRefs = stale.baseRefs.filter((b) => b.ref !== 'feature/platform');
    expect(problems(remembered, stale)).toEqual([]);
    expect(problems({ ...remembered, tile: 'new' }, stale)).toEqual([
      'Ta gałąź nie jest już dostępna. Wybierz inną lub wyłącz tę opcję.',
    ]);
  });
  it('a selected tile that became unavailable blocks Create without a silent jump', () => {
    const closed = options('git-disabled');
    expect(activeTile(choice({ tile: 'new' }), closed)).toBe('new');
    expect(problems(choice({ tile: 'new' }), closed)).toEqual([
      'Ten wariant nie jest już dostępny. Wybierz inną opcję.',
    ]);
  });
  it('existing needs a selection', () => {
    expect(problems(choice({ tile: 'existing' }), options())).toEqual([
      'Wybierz środowisko pracy.',
    ]);
    expect(
      problems(choice({ tile: 'existing', existingWorkspaceId: ids.spike }), options()),
    ).toEqual(['To środowisko pracy nie jest już dostępne.']);
  });
  it('nothing available blocks Create', () => {
    expect(problems(choice(), options('none-available'))).toEqual([
      'Brak dostępnego środowiska pracy.',
    ]);
  });
});

describe('mergeSuggestion (D5)', () => {
  const onPlatform = choice({ tile: 'new', base: { on: true, ref: 'feature/platform' } });
  it('offers merging back to a registered workspace, never automatically', () => {
    expect(mergeSuggestion(onPlatform, options())).toEqual({
      kind: 'offer',
      workspaceId: ids.platform,
      branch: 'feature/platform',
    });
    expect(buildCreateTarget(onPlatform, options())).toEqual({
      kind: 'new-worktree',
      baseRef: 'feature/platform',
    });
  });
  it('says why a dirty workspace is not offered', () => {
    expect(
      mergeSuggestion(
        choice({ tile: 'new', base: { on: true, ref: 'feature/payments' } }),
        options(),
      ),
    ).toEqual({ kind: 'dirty', branch: 'feature/payments' });
  });
  it('is silent for the primary branch, an unregistered ref, a declined or accepted offer', () => {
    expect(
      mergeSuggestion(choice({ tile: 'new', base: { on: true, ref: 'develop' } }), options()),
    ).toBeUndefined();
    expect(
      mergeSuggestion(choice({ tile: 'new', base: { on: true, ref: 'release/1.4' } }), options()),
    ).toBeUndefined();
    expect(
      mergeSuggestion({ ...onPlatform, dismissedSuggestions: { [ids.platform]: true } }, options()),
    ).toBeUndefined();
    expect(
      mergeSuggestion(
        { ...onPlatform, target: { on: true, workspaceId: ids.platform } },
        options(),
      ),
    ).toBeUndefined();
  });
  it('stays an offer even when a linked workspace holds the project target branch', () => {
    // The default target is the primary, so a linked workspace on that branch is not "already the target".
    const value = options('primary-other-branch');
    expect(
      mergeSuggestion(choice({ tile: 'new', base: { on: true, ref: 'develop' } }), value),
    ).toEqual({ kind: 'offer', workspaceId: ids.platform, branch: 'develop' });
  });
  it('the effective target branch follows an explicit pick, else the project target', () => {
    expect(effectiveTargetBranch(choice(), options())).toBe('develop');
    expect(
      effectiveTargetBranch(choice({ target: { on: true, workspaceId: ids.platform } }), options()),
    ).toBe('feature/platform');
    // Switch on, nothing picked yet: there is no target to claim.
    expect(
      effectiveTargetBranch(choice({ target: { on: true, workspaceId: '' } }), options()),
    ).toBeUndefined();
  });
});

describe('copy helpers', () => {
  it('summarises overrides', () => {
    expect(settingsSummary(choice())).toBe('Ustawienia domyślne');
    expect(settingsSummary(choice({ base: { on: true, ref: 'main' } }))).toBe(
      'Zmienione ustawienia (1): baza',
    );
    expect(
      settingsSummary(
        choice({
          base: { on: true, ref: 'main' },
          target: { on: true, workspaceId: ids.main },
          branch: { on: true, name: 'x' },
        }),
      ),
    ).toBe('Zmienione ustawienia (3): baza, cel, nazwa');
    expect(settingsSummary(choice({ base: { on: true, ref: '' } }))).toBe('Ustawienia domyślne');
  });
  it('inflects counts in Polish', () => {
    expect(specCountLabel(0)).toBe('brak specyfikacji');
    expect(specCountLabel(1)).toBe('1 specyfikacja');
    expect(specCountLabel(2)).toBe('2 specyfikacje');
    expect(specCountLabel(5)).toBe('5 specyfikacji');
    expect(specCountLabel(12)).toBe('12 specyfikacji');
    expect(sharedUseNote(2, 'workspace')).toBe(
      '2 istniejące specyfikacje używają już tego środowiska pracy. Zmiany i historia Git będą wspólne.',
    );
    expect(sharedUseNote(1, 'workspace')).toContain(
      '1 istniejąca specyfikacja używa już tego środowiska pracy',
    );
    expect(sharedUseNote(5, 'katalog')).toContain(
      '5 istniejących specyfikacji używa już tego katalogu',
    );
  });
});

describe('enabling the base switch starts from the effective default (F-08)', () => {
  it('base: the default ref, or the primary branch for a HEAD default, else nothing', () => {
    expect(defaultBaseValue(options())).toBe('develop');
    expect(defaultBaseValue(options('head-base'))).toBe('develop');
    expect(defaultBaseValue(options('head-base-no-branch'))).toBe('');
    const unlisted = options();
    unlisted.baseRefs = unlisted.baseRefs.filter((item) => item.ref !== 'develop');
    expect(defaultBaseValue(unlisted)).toBe('');
  });
});

describe('switch values come from the options, never from a hard-coded branch', () => {
  const custom = () => ({
    ...options(),
    defaultBaseRef: 'release/1.4',
    integrationTargetBranch: 'feature/platform',
  });
  it('base on: the explicit value equal to the options default is sent; off: omitted', () => {
    const o = custom();
    const ref = defaultBaseValue(o);
    expect(ref).toBe('release/1.4');
    expect(buildCreateTarget(choice({ tile: 'new', base: { on: true, ref } }), o)).toEqual({
      kind: 'new-worktree',
      baseRef: 'release/1.4',
    });
    expect(buildCreateTarget(choice({ tile: 'new', base: { on: false, ref } }), o)).toEqual({
      kind: 'new-worktree',
    });
  });
  it('target on: only the chosen selectable workspace is sent; off: omitted', () => {
    const o = custom();
    const workspaceId = ids.platform;
    expect(
      buildCreateTarget(choice({ tile: 'new', target: { on: true, workspaceId } }), o),
    ).toEqual({
      kind: 'new-worktree',
      integrationTargetWorkspaceId: ids.platform,
    });
    expect(
      buildCreateTarget(choice({ tile: 'new', target: { on: false, workspaceId } }), o),
    ).toEqual({
      kind: 'new-worktree',
    });
  });
});

describe('requestChoiceSnapshot', () => {
  it('ignores UI-only state so opening the disclosure is not an edit', () => {
    const base = choice({ branch: { on: true, name: 'feature/x' } });
    const same = requestChoiceSnapshot(base);
    expect(requestChoiceSnapshot({ ...base, settingsOpen: true })).toEqual(same);
    expect(requestChoiceSnapshot({ ...base, dismissedSuggestions: { a: true } })).toEqual(same);
    expect(requestChoiceSnapshot({ ...base, branch: { on: true, name: 'feature/y' } })).not.toEqual(
      same,
    );
  });
});

describe('operation diagnostics', () => {
  it('names the known stage and localises the time', () => {
    expect(operationStageLabel('workspace-prepared')).toBe('Środowisko pracy przygotowane');
    expect(operationStageLabel('something-new')).toBe('something-new');
    expect(formatOperationTime('2026-10-20T14:32:08Z')).not.toContain('T14');
    expect(formatOperationTime('not a time')).toBe('not a time');
  });
});

describe('integration target request semantics (explicit pin vs follow the project)', () => {
  const newTile = (patch: Partial<WorkspaceChoice> = {}) => choice({ tile: 'new', ...patch });
  it('switch off sends no integrationTargetWorkspaceId, whatever is remembered', () => {
    for (const workspaceId of ['', ids.main, ids.platform])
      expect(buildCreateTarget(newTile({ target: { on: false, workspaceId } }), options())).toEqual(
        {
          kind: 'new-worktree',
        },
      );
  });
  it('switch on without a pick sends nothing and blocks Create with the footer prerequisite', () => {
    const pending = newTile({ target: { on: true, workspaceId: '' } });
    expect(buildCreateTarget(pending, options())).toEqual({ kind: 'new-worktree' });
    expect(problems(pending, options())).toEqual(['Wybierz cel scalenia lub wyłącz tę opcję.']);
  });
  it('picking the primary workspace explicitly IS a pin request, unlike leaving the switch off', () => {
    const picked = newTile({ target: { on: true, workspaceId: ids.main } });
    expect(buildCreateTarget(picked, options())).toEqual({
      kind: 'new-worktree',
      integrationTargetWorkspaceId: ids.main,
    });
    expect(problems(picked, options())).toEqual([]);
    expect(buildCreateTarget(newTile(), options())).not.toEqual(
      buildCreateTarget(picked, options()),
    );
  });
  it('the target is independent of baseRef and never derived from a branch name', () => {
    for (const ref of ['feature/platform', 'develop', 'spec/architecture'])
      expect(buildCreateTarget(newTile({ base: { on: true, ref } }), options())).toEqual({
        kind: 'new-worktree',
        baseRef: ref,
      });
    const both = buildCreateTarget(
      newTile({
        base: { on: true, ref: 'feature/platform' },
        target: { on: true, workspaceId: ids.architecture },
      }),
      options(),
    );
    expect(both).toEqual({
      kind: 'new-worktree',
      baseRef: 'feature/platform',
      integrationTargetWorkspaceId: ids.architecture,
    });
    expect(
      buildCreateTarget(newTile({ branch: { on: true, name: 'develop-2' } }), options()),
    ).toEqual({ kind: 'new-worktree', branch: 'develop-2' });
  });
  it('accepting the merge suggestion is the only way it becomes a pin; declining sends nothing', () => {
    const base = newTile({ base: { on: true, ref: 'feature/platform' } });
    expect(mergeSuggestion(base, options())).toMatchObject({ kind: 'offer' });
    expect(buildCreateTarget(base, options())).not.toHaveProperty('integrationTargetWorkspaceId');
    const declined = { ...base, dismissedSuggestions: { [ids.platform]: true as const } };
    expect(buildCreateTarget(declined, options())).not.toHaveProperty(
      'integrationTargetWorkspaceId',
    );
    const accepted = { ...base, target: { on: true, workspaceId: ids.platform } };
    expect(buildCreateTarget(accepted, options())).toMatchObject({
      integrationTargetWorkspaceId: ids.platform,
    });
  });
  it('an unavailable remembered pick blocks instead of silently falling back', () => {
    const stale = newTile({ target: { on: true, workspaceId: ids.payments } });
    expect(problems(stale, options())).toEqual([
      'To środowisko pracy nie może już być celem scalenia. Wybierz inny lub wyłącz tę opcję.',
    ]);
  });
});
