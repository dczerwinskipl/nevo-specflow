import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import type { AppLocale } from '../../../../i18n';
import { createOptionsFixture, workspaceIds as ids } from '../creationOptions.stories-support';
import { WorkspacePlaceSection } from './WorkspacePlaceSection';
import { ExistingSummary, MainSummary, NewSummary } from './WorkspaceTileSummaries';
import { initialWorkspaceChoice, type WorkspaceChoice } from './workspaceChoice';
import { revalidate } from './workspaceValidation';

const choice = (patch: Partial<WorkspaceChoice> = {}): WorkspaceChoice => ({
  ...initialWorkspaceChoice,
  ...patch,
});
const html = (node: React.ReactNode, locale: AppLocale = 'en') =>
  renderToStaticMarkup(<StoryLocalization locale={locale}>{node}</StoryLocalization>);
// Markup splits a sentence around the branch chip; compare the readable text.
const text = (markup: string) =>
  (new DOMParser().parseFromString(markup, 'text/html').body.textContent ?? '').replace(
    /\s+/g,
    ' ',
  );

const newSummary = (variant: Parameters<typeof createOptionsFixture>[0], title = 'Payments') => {
  const options = createOptionsFixture(variant);
  const value = choice({ tile: 'new' });
  return html(
    <NewSummary
      options={options}
      choice={value}
      update={vi.fn()}
      errors={revalidate(value, options)}
      title={title}
      onAnnounce={vi.fn()}
      controls={{
        base: { current: null },
        target: { current: null },
        branch: { current: null },
        slug: { current: null },
      }}
      onRequestFocus={vi.fn()}
    />,
  );
};

describe('Commit summary (only when the options carry `commits`)', () => {
  it('a new workspace says where the files will be committed', () => {
    const markup = text(newSummary('commits'));
    expect(markup).toContain('Commit');
    expect(markup).toContain(
      'The specification files will be committed to branch feature/payments.',
    );
  });

  it('shows no Commit row and no protection text without `commits`', () => {
    const markup = text(newSummary('default'));
    expect(markup).not.toContain('committed to branch');
    expect(markup).not.toContain('protected');
  });

  it('the current folder and an existing workspace name their branch', () => {
    const options = createOptionsFixture('commits');
    expect(text(html(<MainSummary options={options} />))).toContain('committed to branch develop.');
    const existing = text(
      html(
        <ExistingSummary
          options={options}
          choice={choice({ tile: 'existing', existingWorkspaceId: ids.platform })}
          update={vi.fn()}
          errors={{}}
          controlRef={{ current: null }}
        />,
      ),
    );
    expect(existing).toContain('committed to branch feature/platform.');
    expect(text(html(<MainSummary options={createOptionsFixture()} />))).not.toContain(
      'committed to branch',
    );
  });

  it('is said in Polish too', () => {
    expect(text(html(<MainSummary options={createOptionsFixture('commits')} />, 'pl'))).toContain(
      'zostaną zapisane w commicie na gałęzi develop.',
    );
  });

  it('a protected generated branch is flagged on the branch row with the way out', () => {
    const markup = text(newSummary('new-branch-protected'));
    expect(markup).toContain('The generated branch release/payments is protected');
    expect(markup).toContain('Use your own branch name');
  });
});

describe('protected tiles', () => {
  const section = (variant: Parameters<typeof createOptionsFixture>[0], value = choice()) =>
    text(
      html(
        <WorkspacePlaceSection
          state={{ status: 'ready', options: createOptionsFixture(variant) }}
          choice={value}
          update={vi.fn()}
          locked={false}
          onRefresh={vi.fn()}
          onAnnounce={vi.fn()}
          title="Payments"
          headingId="h"
        />,
      ),
    );

  it('names the protected branch in the tile and suggests the new workspace while another tile is active', () => {
    const markup = section('protected-primary', choice({ tile: 'existing' }));
    expect(markup).toContain(
      'The branch main is protected: Nevo does not commit there. Create the specification in a new workspace.',
    );
    expect(markup).toContain('Use New workspace');
  });

  it('offers no suggestion once the new workspace is the active tile', () => {
    expect(section('protected-primary')).not.toContain('Use New workspace');
  });

  it('shows nothing about protection without `commits`', () => {
    const markup = section('default', choice({ tile: 'main' }));
    expect(markup).not.toContain('protected');
    expect(markup).not.toContain('Use New workspace');
  });

  it('an invalid Git configuration disables New workspace with a calm message', () => {
    expect(section('git-policy-invalid')).toContain(
      'The project&#x27;s Git configuration is invalid. Check .nevo/config.yaml.',
    );
  });
});
