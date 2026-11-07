// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import type { OperationsApi } from '../../../shared/operations/operationsApi';
import { createOperationEventsUrl, type ProjectCreationApi } from './api/api.project';
import type { DemoCreationApi } from './api/api.demo';
import { CreateSpecificationScreen } from './CreateSpecificationScreen';
import {
  createOptionsFixture,
  type OptionsVariant,
} from './options/creationOptions.stories-support';
import { catalogue } from './options/creationCatalogue.stories-support';
import { createSessionOperationStorage } from './operation/createOperationStorage';

/**
 * A Create blocked by the form's values: the button stays focusable (`aria-disabled`), and
 * activating it, Enter in a field or the footer's "Go to the field" sends nothing and leads to the
 * first faulty field in the form's order.
 */

const operations: OperationsApi = {
  list: () => Promise.resolve({ kind: 'unavailable' as const }),
  // eslint-disable-next-line require-yield
  async *watchProgress() {
    await Promise.resolve();
  },
};

function renderProject(variant: OptionsVariant = 'default') {
  const create = vi.fn();
  const onProjectStarted = vi.fn();
  const services = createSpecFlowAppServices({
    runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
    projectCreationApi: {
      operationEventsUrl: createOperationEventsUrl,
      archetypes: () => Promise.resolve(catalogue),
      createOptions: () => Promise.resolve(createOptionsFixture(variant)),
      create,
    } as unknown as ProjectCreationApi,
    operationsApi: operations,
  });
  mount(services, onProjectStarted);

  return { create, onProjectStarted };
}

function renderDemo() {
  const defaults = createSpecFlowAppServices();
  const create = vi.fn<DemoCreationApi['create']>();
  const services = createSpecFlowAppServices({
    runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'demo' }) },
    demoCreationApi: {
      ...defaults.demoCreationApi,
      catalogue: () => Promise.resolve(catalogue),
      createOptions: () => Promise.resolve(createOptionsFixture('default')),
      create,
    },
    operationsApi: operations,
  });
  mount(services, vi.fn());

  return { create };
}

function mount(
  services: ReturnType<typeof createSpecFlowAppServices>,
  onProjectStarted: () => void,
) {
  render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <VisitStateProvider>
            <AppWorkspaceProvider>
              <AppShell navigation={<div>Nav</div>}>
                <CreateSpecificationScreen
                  onCreated={vi.fn()}
                  onProjectStarted={onProjectStarted}
                  onSession={vi.fn()}
                  onBack={vi.fn()}
                />
              </AppShell>
            </AppWorkspaceProvider>
          </VisitStateProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
}

const createButton = (name = 'Create specification') => screen.getByRole('button', { name });
const nameField = () => screen.getByLabelText<HTMLInputElement>('Specification name');
const liveRegion = () =>
  [...document.querySelectorAll('form p[role="status"].sr-only')].map((node) => node.textContent);

/** Waits for the options and the archetypes, so only the form's own values can block Create. */
async function formReady() {
  await screen.findByRole('radio', { name: /new workspace/i });
  await screen.findByRole('radio', { name: /Feature/ });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
    onchange: null,
  }));
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a blocked Create on a project Runtime', () => {
  it('stays focusable, says nothing before the owner acts, then leads to the empty name', async () => {
    const { create, onProjectStarted } = renderProject();
    await formReady();
    const submit = createButton();
    expect(submit.getAttribute('type')).toBe('submit');
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    // No error before the owner interacted.
    expect(nameField().getAttribute('aria-invalid')).toBeNull();
    // Passing through the empty field is not an interaction worth an error either.
    fireEvent.focus(nameField());
    fireEvent.blur(nameField());
    expect(nameField().getAttribute('aria-invalid')).toBeNull();

    fireEvent.click(submit);

    await waitFor(() => expect(document.activeElement).toBe(nameField()));
    expect(nameField().getAttribute('aria-invalid')).toBe('true');
    const errorId = nameField().getAttribute('aria-describedby')!;
    expect(document.getElementById(errorId.split(' ').at(-1)!)?.textContent).toBe(
      'Enter a specification name.',
    );
    expect(liveRegion()).toContain('Enter a specification name.');
    // Nothing was prepared, stored or sent.
    expect(create).not.toHaveBeenCalled();
    expect(onProjectStarted).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it('several problems at once: always the first in the form order, then the next one', async () => {
    // An empty name and a generated branch the project protects.
    const { create } = renderProject('new-branch-protected');
    await formReady();

    fireEvent.click(createButton());
    await waitFor(() => expect(document.activeElement).toBe(nameField()));
    // Again: the same field, not the next one.
    fireEvent.click(createButton());
    await waitFor(() => expect(document.activeElement).toBe(nameField()));

    fireEvent.change(nameField(), { target: { value: 'Payment limits' } });
    fireEvent.click(createButton());
    // The protected branch opens the Branch name row and focuses its branch field.
    const branch = await screen.findByLabelText<HTMLInputElement>('New branch name');
    await waitFor(() => expect(document.activeElement).toBe(branch));
    expect(branch.getAttribute('aria-invalid')).toBe('true');
    expect(create).not.toHaveBeenCalled();
  });

  it('Enter in a field never submits: it leads to the field instead', async () => {
    const { create, onProjectStarted } = renderProject('new-branch-protected');
    await formReady();
    fireEvent.change(nameField(), { target: { value: 'Payment limits' } });
    // Enter in a text field is the form's implicit submission.
    fireEvent.submit(nameField().form!);
    const branch = await screen.findByLabelText<HTMLInputElement>('New branch name');
    await waitFor(() => expect(document.activeElement).toBe(branch));
    expect(create).not.toHaveBeenCalled();
    expect(onProjectStarted).not.toHaveBeenCalled();
  });

  it('the footer names the reason and offers "Go to the field", which does the same', async () => {
    renderProject();
    await formReady();
    const footer = document.querySelector('footer')!;
    expect(within(footer).getByText('Enter a specification name.')).toBeTruthy();
    fireEvent.click(within(footer).getByRole('button', { name: 'Go to the field' }));
    await waitFor(() => expect(document.activeElement).toBe(nameField()));
  });

  it('a valid form still hands the request over (the guard only applies while blocked)', async () => {
    const { onProjectStarted } = renderProject();
    await formReady();
    fireEvent.change(nameField(), { target: { value: 'Payment limits' } });
    await waitFor(() => expect(createButton().getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(createButton());
    await waitFor(() => expect(onProjectStarted).toHaveBeenCalledOnce());
    expect(
      createSessionOperationStorage('unknown', sessionStorage).load(
        onProjectStarted.mock.calls[0]![0] as string,
      ),
    ).toBeDefined();
  });
});

describe('a blocked Create in the demo', () => {
  it('sends no request: the create endpoint is never called for an invalid form', async () => {
    const { create } = renderDemo();
    fireEvent.click(await screen.findByRole('button', { name: /On my own/ }));
    await formReady();
    const submit = createButton();
    expect(submit.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(submit);
    await waitFor(() => expect(document.activeElement).toBe(nameField()));
    fireEvent.submit(nameField().form!);
    fireEvent.click(screen.getByRole('button', { name: 'Go to the field' }));

    expect(create).not.toHaveBeenCalled();
  });

  it('with an agent, a missing model is the next field after the name and archetype', async () => {
    const { create } = renderDemo();
    fireEvent.click(await screen.findByRole('button', { name: /With an agent/ }));
    await formReady();
    fireEvent.change(nameField(), { target: { value: 'Payment limits' } });
    fireEvent.click(createButton('Create and open session'));
    const model = screen.getByRole('combobox', { name: 'Model' });
    await waitFor(() => expect(document.activeElement).toBe(model));
    expect(model.getAttribute('aria-invalid')).toBe('true');
    expect(create).not.toHaveBeenCalled();
  });
});
