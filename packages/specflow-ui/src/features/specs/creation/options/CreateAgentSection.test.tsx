// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { initialAgentChoice, startCatalogueFromDemo } from '../../../sessions';
import { catalogue } from './creationCatalogue.stories-support';
import { CreateAgentSection } from './CreateAgentSection';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSection(errors: {
  providerError?: string;
  effortError?: string;
  modeError?: string;
}) {
  const choice = initialAgentChoice(startCatalogueFromDemo(catalogue));
  const model = catalogue.providers.find((p) => p.id === choice.providerId)!.models[0]!;
  render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <CreateAgentSection
        catalogue={catalogue}
        choice={{ ...choice, modelId: model.id }}
        locked={false}
        onChange={vi.fn()}
        {...errors}
      />
    </LocalizationProvider>,
  );
}

const describedText = (element: Element) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/u)
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ');

describe('CreateAgentSection says agent problems at their own control', () => {
  it('the provider cards are invalid and described by the message', () => {
    renderSection({ providerError: 'Choose an available agent.' });
    const group = screen.getAllByRole('radiogroup')[0]!;
    expect(group.getAttribute('aria-invalid')).toBe('true');
    expect(describedText(group)).toContain('Choose an available agent.');
  });

  it('the work mode is invalid and described by the message', () => {
    renderSection({ modeError: 'Choose a supported work mode.' });
    const mode = screen.getByRole('radiogroup', { name: 'Work mode' });
    expect(mode.getAttribute('aria-invalid')).toBe('true');
    expect(describedText(mode)).toContain('Choose a supported work mode.');
  });

  it('the Effort picker is invalid and described by the message', () => {
    renderSection({ effortError: 'Choose an effort this model supports.' });
    const effort = screen.getByRole('combobox', { name: 'Effort' });
    expect(effort.getAttribute('aria-invalid')).toBe('true');
    expect(describedText(effort)).toContain('Choose an effort this model supports.');
  });

  it('says nothing without a problem', () => {
    renderSection({});
    for (const group of screen.getAllByRole('radiogroup')) {
      expect(group.getAttribute('aria-invalid')).toBeNull();
    }
  });
});
