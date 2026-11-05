// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoryLocalization } from '../../../i18n/StoryLocalization';
import { ComposerModePicker } from './ComposerPresetPicker';
import { ModelEffortPicker } from './ModelEffortPicker';
import { providerFixture } from './managedSession.stories-support';

afterEach(cleanup);

const renderModel = (value: Parameters<typeof ModelEffortPicker>[0]['value']) =>
  render(
    <StoryLocalization locale="en">
      <ModelEffortPicker provider={providerFixture()} value={value} onChange={vi.fn()} />
    </StoryLocalization>,
  );

describe('ModelEffortPicker trigger', () => {
  it('names its purpose and the selected model (N-D3)', () => {
    renderModel({ modelId: 'mock-standard', effort: 'low' });

    const trigger = screen.getByRole('button', { name: 'Model: Standard · low' });
    expect(trigger.textContent).toBe('Standard · low');
  });

  it('shows the raw model id when the catalogue does not list the session model', () => {
    renderModel({ modelId: 'retired-model-7' });

    expect(screen.getByRole('button', { name: 'Model: retired-model-7' })).toBeTruthy();
    expect(screen.queryByText('Select model')).toBeNull();
  });

  it('shows "Default model" when the session has no model (provider default)', () => {
    renderModel(undefined);

    expect(screen.getByRole('button', { name: 'Model: Default model' })).toBeTruthy();
    expect(screen.queryByText('Select model')).toBeNull();
  });
});

describe('ComposerModePicker trigger', () => {
  it('names its purpose and the selected work mode', () => {
    render(
      <StoryLocalization locale="en">
        <ComposerModePicker
          options={[
            { id: 'plan', title: 'Plan' },
            { id: 'build', title: 'Build' },
          ]}
          value="plan"
          onChange={vi.fn()}
        />
      </StoryLocalization>,
    );

    expect(screen.getByRole('button', { name: 'Work mode: Plan' }).textContent).toBe('Plan');
  });
});
