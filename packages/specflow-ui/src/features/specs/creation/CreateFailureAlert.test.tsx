import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import type { AppLocale } from '../../../i18n';
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

  it('renders a translated title for a generic failure', () => {
    expect(render({ kind: 'failed' }, 'pl')).toContain('Nie udało się utworzyć specyfikacji');
    expect(render({ kind: 'failed' }, 'en')).toContain('Unable to create the specification');
  });
});
