import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import type { AppLocale } from '../../../../i18n';
import { CreateFailureAlert } from './CreateFailureAlert';
import type { CreateFailure } from './createFailure';

function render(failure: CreateFailure, locale: AppLocale) {
  return renderToStaticMarkup(
    <StoryLocalization locale={locale}>
      <CreateFailureAlert
        failure={failure}
        details={[]}
        status={null}
        statusUnreadable={false}
        connectionLost={false}
        refreshing={false}
        onCopy={() => undefined}
        onRefresh={() => undefined}
        onRefreshArchetypes={() => undefined}
        onUseAutomaticName={() => undefined}
        onUseCustomName={() => undefined}
      />
    </StoryLocalization>,
  );
}

describe('CreateFailureAlert copy', () => {
  it('maps a stale-option code to its own explanation in both languages', () => {
    const failure: CreateFailure = { kind: 'stale', code: 'BASE_REF_NOT_FOUND' };
    expect(render(failure, 'pl')).toContain('Wybrana gałąź początkowa nie jest już dostępna.');
    expect(render(failure, 'en')).toContain('The selected starting branch is no longer available.');
  });

  it('falls back to the generic explanation for an unknown code and never shows server text', () => {
    const html = render({ kind: 'stale', code: 'SOMETHING_NEW' }, 'en');
    expect(html).toContain('One of the selected options is no longer valid or available.');
    expect(html).not.toContain('SOMETHING_NEW');
  });

  it.each<[CreateFailure, string, string]>([
    [
      { kind: 'branch-protected', cause: 'workspace' },
      'Gałąź jest chroniona',
      'The branch of the selected workspace is protected',
    ],
    [
      { kind: 'branch-protected', cause: 'typed-branch' },
      'Gałąź jest chroniona',
      'The branch name you typed is protected',
    ],
    [
      { kind: 'branch-protected', cause: 'generated-branch' },
      'Gałąź jest chroniona',
      'The branch Nevo would generate is protected',
    ],
    [
      { kind: 'commit-blocked' },
      'Git nie może teraz przyjąć commita',
      'a merge or rebase is in progress',
    ],
    [
      { kind: 'recovery-required', committed: true },
      'Pliki specyfikacji powstały, ale nie udało się zapisać ich w commicie',
      'Do not create it again',
    ],
  ])('says in plain words what happened to %j', (failure, polish, english) => {
    expect(render(failure, 'pl')).toContain(polish);
    expect(render(failure, 'en')).toContain(english);
  });

  it('a refusal that created nothing says so; the commit failure says the files exist', () => {
    expect(render({ kind: 'commit-blocked' }, 'en')).toContain('The specification was not created');
    expect(render({ kind: 'branch-protected', cause: 'workspace' }, 'en')).toContain(
      'The specification was not created',
    );
    const committed = render({ kind: 'recovery-required', committed: true }, 'en');
    expect(committed).toContain('could not be committed');
    expect(committed).not.toContain('was not created');
    expect(committed).toContain('Copy diagnostic data');
  });

  it('offers a remedy only where one exists in the form', () => {
    expect(render({ kind: 'branch-protected', cause: 'workspace' }, 'en')).toContain(
      'Refresh options',
    );
    expect(render({ kind: 'branch-protected', cause: 'generated-branch' }, 'en')).toContain(
      'Enter your own name',
    );
    expect(render({ kind: 'branch-protected', cause: 'typed-branch' }, 'en')).not.toContain(
      '<button',
    );
  });

  it('renders a translated title for a generic failure', () => {
    expect(render({ kind: 'failed' }, 'pl')).toContain('Nie udało się utworzyć specyfikacji');
    expect(render({ kind: 'failed' }, 'en')).toContain('Unable to create the specification');
  });
});
