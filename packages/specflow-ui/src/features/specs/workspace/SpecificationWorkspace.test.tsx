import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@nevo/ui';
import { appI18n, LocalizationProvider } from '../../../i18n';
import { SpecificationWorkspace } from './SpecificationWorkspace';
import { DocumentsView } from './DocumentsView';

import { createSpecificationWorkspaceFixture } from './fixtures';

function renderWorkspaceMarkup(
  props: Partial<React.ComponentProps<typeof SpecificationWorkspace>> = {},
) {
  const data = props.data ?? createSpecificationWorkspaceFixture('working', 'UI-1234');
  return renderToStaticMarkup(
    <LocalizationProvider>
      <AppShell navigation={<div>Nav</div>}>
        <SpecificationWorkspace specId="UI-1234" data={data} {...props} />
      </AppShell>
    </LocalizationProvider>,
  );
}

describe('SpecificationWorkspace', () => {
  beforeEach(async () => {
    await appI18n.changeLanguage('pl');
  });

  it('renders working scenario with title, attention, tasks, and activity history', () => {
    const markup = renderWorkspaceMarkup();

    // Body title and identity
    expect(markup).toContain('Odświeżanie sesji i zachowanie kontekstu użytkownika');
    expect(markup).toContain('ID specyfikacji: UI-1234');

    // Attention section
    expect(markup).toContain('Wymaga Twojej uwagi');
    expect(markup).toContain('TASK-03 · Rozstrzygnij zachowanie po cofnięciu uprawnień');

    // Resume session
    expect(markup).toContain('Implementacja odświeżania sesji');

    // Task groups
    expect(markup).toContain('Implementacja');
    expect(markup).toContain('Weryfikacja i domknięcie');
    expect(markup).toContain('Ukończone');

    // Primary content is rendered in SSR
    expect(markup).toContain('Odświeżanie sesji i zachowanie kontekstu użytkownika');
    expect(markup).toContain('ID specyfikacji: UI-1234');
  });

  it('renders repository context when git is enabled', () => {
    const markup = renderWorkspaceMarkup();

    expect(markup).toContain('Repozytorium');
    expect(markup).toContain('feature/session-refresh');
    expect(markup).toContain('PR #128');
    expect(markup).toContain('Przegląd PR →');
    expect(markup).toContain('Zmiany →');
  });

  it('omits repository context and extra views in no-git scenario', () => {
    const markup = renderWorkspaceMarkup({
      data: createSpecificationWorkspaceFixture('no-git', 'UI-1234'),
    });

    expect(markup).not.toContain('feature/session-refresh');
    expect(markup).not.toContain('PR #128');
  });

  it('renders empty scenario with preparation banner and no task list', () => {
    const markup = renderWorkspaceMarkup({
      data: createSpecificationWorkspaceFixture('empty', 'UI-1234'),
    });

    expect(markup).toContain('Przygotuj specyfikację do realizacji');
    expect(markup).toContain('Rozpocznij rozmowę');
    expect(markup).not.toContain('2 / 7 ukończone');
  });

  it('renders preparing scenario with notice and tasks in preparation', () => {
    const markup = renderWorkspaceMarkup({
      data: createSpecificationWorkspaceFixture('preparing', 'UI-1234'),
    });

    expect(markup).toContain('Taski są jeszcze w przygotowaniu');
    expect(markup).toContain('Przygotowanie do review');
    expect(markup).toContain('w przygotowaniu');
  });

  it('renders git-conflict scenario with conflict attention item', () => {
    const markup = renderWorkspaceMarkup({
      data: createSpecificationWorkspaceFixture('git-conflict', 'UI-1234'),
    });

    expect(markup).toContain('Worktree ma nierozwiązane konflikty');
    expect(markup).toContain('Sprawdź konflikty');
  });

  it('renders initial task view when initialTask is provided', () => {
    const markup = renderWorkspaceMarkup({ initialTask: 'TASK-03' });

    expect(markup).toContain('Wróć do specyfikacji');
    expect(markup).toContain('Opis i cel');
    expect(markup).toContain('Kryteria akceptacji');
  });

  it('renders documents view when initialView is documents', () => {
    const markup = renderWorkspaceMarkup({ initialView: 'documents' });

    expect(markup).toContain('Szukaj dokumentu');
    expect(markup).toContain('Specyfikacja');
    expect(markup).toContain('Obszar: uwierzytelnianie');
  });

  it('renders sessions view when initialView is sessions', () => {
    const markup = renderWorkspaceMarkup({ initialView: 'sessions' });

    expect(markup).toContain('Sesje tej specyfikacji');
    expect(markup).toContain('Nowa rozmowa');
  });

  it('renders changes view when initialView is changes', () => {
    const markup = renderWorkspaceMarkup({ initialView: 'changes' });

    expect(markup).toContain('Względem main');
    expect(markup).toContain('Niecommitowane');
    expect(markup).toContain('src/auth/refreshSession.ts');
  });

  it('renders Specification header eyebrow with back link and specification identity', () => {
    const markup = renderWorkspaceMarkup();

    expect(markup).toContain('data-spec-back-label');
    expect(markup).toContain('data-spec-identity');
    expect(markup).toContain('ID specyfikacji: UI-1234');
  });

  it('renders honest capabilities: disabled conversation action when onNewConversation is not provided', () => {
    const markup = renderWorkspaceMarkup({
      onNewConversation: undefined,
    });

    // In ResumeSessionSection, button should be disabled and have title "Niezaimplementowane"
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Niezaimplementowane');
  });

  it('renders honest capabilities: does not render diff button when onDiff is not provided', () => {
    const markup = renderWorkspaceMarkup({
      initialView: 'changes',
      onDiff: undefined,
    });

    expect(markup).not.toContain('Pokaż diff');
  });

  it('renders markdown content in document detail view using MarkdownDocument', () => {
    const markup = renderToStaticMarkup(
      <LocalizationProvider>
        <DocumentsView
          documents={[
            {
              id: 'doc-spec',
              title: 'Główna specyfikacja',
              kind: 'spec',
              content: '### Szczegóły techniczne\n\nTo jest **sformatowany** tekst markdown.',
            },
          ]}
          activeDocId="doc-spec"
          docOrigin="documents"
          onSelectDoc={vi.fn()}
          onBackToOrigin={vi.fn()}
        />
      </LocalizationProvider>,
    );

    expect(markup).toContain('Główna specyfikacja');
    expect(markup).toContain('Szczegóły techniczne');
    expect(markup).toContain(
      '<strong class="font-semibold text-content-primary">sformatowany</strong>',
    );
  });
});
