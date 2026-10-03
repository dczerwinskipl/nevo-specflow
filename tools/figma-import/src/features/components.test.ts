import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ComponentCaptureIR,
  FigmaComponentDefinition,
  DesignSystemIR,
  DesignResources,
} from '../core/model';
import { DATA_KEY } from '../core/model';
import { configureComponent, reconcileNestedSlotOverrides } from './componentSlots';
import { reconcileComponentNestedSlots, upsertComponentSet } from './components';

vi.mock('./componentSlots', () => ({
  configureComponent: vi.fn(),
  reconcileNestedSlotOverrides: vi.fn(),
}));
vi.mock('./overviews', () => ({ layoutSetMatrix: vi.fn() }));

function component(id: string, stableId = '') {
  const pluginData = new Map<string, string>([[DATA_KEY, stableId]]);
  return {
    id,
    type: 'COMPONENT',
    parent: undefined,
    children: [],
    getPluginData: (key: string) => pluginData.get(key) ?? '',
    setPluginData: (key: string, value: string) => pluginData.set(key, value),
  } as unknown as ComponentNode;
}

function importFixture(stableIds: readonly string[]) {
  const variantValues = stableIds.map((stableId) => stableId.split('/').at(-1) ?? '');
  const spec = {
    component: 'TestComponent',
    order: 1,
    target: 'component',
    variantProperties: ['state'],
    propertyValues: { state: variantValues },
    slots: {},
  } satisfies FigmaComponentDefinition;
  const captures = stableIds.map((stableId) => ({
    stableId,
    sourceId: stableId,
    component: spec.component,
    properties: { state: stableId.split('/').at(-1) ?? '' },
    root: {},
    bindings: {},
    slots: {},
  })) as ComponentCaptureIR[];
  const ir = {
    kind: 'design-system',
    schemaVersion: 4,
    definitions: [spec],
    resources: { colors: [], textStyles: [], assets: [] },
    components: { [spec.component]: captures },
  } as unknown as DesignSystemIR;
  const resources = {
    colors: new Map(),
    textStyles: new Map(),
    assets: new Map(),
  } satisfies DesignResources;
  return { spec, ir, resources };
}

function figmaWithMasters(initialMasters: ComponentNode[], createdMasters: ComponentNode[]) {
  const nodes = [...initialMasters];
  const setPluginData = new Map<string, string>();
  const combinedChildren: ComponentNode[] = [];
  const combined = {
    id: 'rebuilt-set',
    type: 'COMPONENT_SET',
    children: combinedChildren,
    componentPropertyDefinitions: {},
    getPluginData: (key: string) => setPluginData.get(key) ?? '',
    setPluginData: (key: string, value: string) => setPluginData.set(key, value),
  } as unknown as ComponentSetNode;
  const createComponent = vi.fn(() => {
    const next = createdMasters.shift();
    if (!next) throw new Error('Unexpected component creation');
    nodes.push(next);
    return next;
  });
  const combineAsVariants = vi.fn((masters: ComponentNode[]) => {
    combinedChildren.splice(0, combinedChildren.length, ...masters);
    return combined;
  });
  vi.stubGlobal('figma', {
    currentPage: {
      findAllWithCriteria: ({ types }: { types: NodeType[] }) =>
        nodes.filter((node) => types.includes(node.type)),
    },
    getNodeByIdAsync: vi.fn(async (id: string) => nodes.find((node) => node.id === id) ?? null),
    createComponent,
    combineAsVariants,
  });
  return { createComponent, combineAsVariants, combined };
}

describe('component-set reconstruction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('rebuilds a missing set from all expected masters that already exist', async () => {
    const stableIds = ['TestComponent/default', 'TestComponent/active'];
    const masters = stableIds.map((stableId, index) => component(`master-${index}`, stableId));
    const figmaMock = figmaWithMasters(masters, []);
    const { spec, ir, resources } = importFixture(stableIds);

    await expect(
      upsertComponentSet(
        ir,
        spec,
        {} as SectionNode,
        resources,
        new Map([[spec.component, spec]]),
        24,
      ),
    ).resolves.toBe(figmaMock.combined);

    expect(figmaMock.createComponent).not.toHaveBeenCalled();
    expect(figmaMock.combineAsVariants).toHaveBeenCalledWith(masters, expect.anything());
  });

  it('reuses a standalone component by persisted identity after a display-name migration', async () => {
    const stableId = 'SideNavigation/';
    const existing = component('existing-navigation', stableId);
    const figmaMock = figmaWithMasters([existing], []);
    const spec = {
      component: 'SideNavigation',
      displayName: 'SideNavigation',
      order: 1,
      target: 'component',
      variantProperties: [],
      propertyValues: {},
      slots: {},
    } satisfies FigmaComponentDefinition;
    const capture = {
      stableId,
      sourceId: 'default',
      component: spec.component,
      properties: {},
      root: {},
      bindings: {},
      slots: {},
    } as ComponentCaptureIR;
    const ir = {
      kind: 'design-system',
      schemaVersion: 4,
      definitions: [spec],
      resources: { colors: [], textStyles: [], assets: [] },
      components: { [spec.component]: [capture] },
    } as unknown as DesignSystemIR;
    const resources = {
      colors: new Map(),
      textStyles: new Map(),
      assets: new Map(),
    } satisfies DesignResources;

    await expect(
      upsertComponentSet(
        ir,
        spec,
        {} as SectionNode,
        resources,
        new Map([[spec.component, spec]]),
        24,
      ),
    ).resolves.toBe(existing);

    expect(figmaMock.createComponent).not.toHaveBeenCalled();
    expect(configureComponent).toHaveBeenCalledWith(
      existing,
      capture,
      spec,
      ir,
      resources,
      expect.anything(),
    );
    expect(reconcileNestedSlotOverrides).toHaveBeenCalledWith(
      existing,
      capture,
      spec,
      ir,
      resources,
      expect.anything(),
      expect.any(Function),
    );
    expect(vi.mocked(configureComponent).mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(reconcileNestedSlotOverrides).mock.invocationCallOrder[0]!,
    );
  });

  it('can reapply nested slot overrides after overview instances normalize slot content', async () => {
    const stableIds = ['TestComponent/default', 'TestComponent/active'];
    const masters = stableIds.map((stableId, index) => component(`master-${index}`, stableId));
    figmaWithMasters(masters, []);
    const { spec, ir, resources } = importFixture(stableIds);
    const definitions = new Map([[spec.component, spec]]);

    await reconcileComponentNestedSlots(ir, spec, resources, definitions);

    expect(reconcileNestedSlotOverrides).toHaveBeenCalledTimes(2);
    expect(reconcileNestedSlotOverrides).toHaveBeenNthCalledWith(
      1,
      masters[0],
      ir.components.TestComponent![0],
      spec,
      ir,
      resources,
      definitions,
      expect.any(Function),
    );
    expect(reconcileNestedSlotOverrides).toHaveBeenNthCalledWith(
      2,
      masters[1],
      ir.components.TestComponent![1],
      spec,
      ir,
      resources,
      definitions,
      expect.any(Function),
    );
  });

  it('rebuilds a missing set from both surviving and newly created masters', async () => {
    const stableIds = ['TestComponent/default', 'TestComponent/active'];
    const surviving = component('surviving-master', stableIds[0]);
    const created = component('created-master');
    const figmaMock = figmaWithMasters([surviving], [created]);
    const { spec, ir, resources } = importFixture(stableIds);

    await upsertComponentSet(
      ir,
      spec,
      {} as SectionNode,
      resources,
      new Map([[spec.component, spec]]),
      24,
    );

    expect(figmaMock.createComponent).toHaveBeenCalledOnce();
    expect(created.getPluginData(DATA_KEY)).toBe(stableIds[1]);
    expect(figmaMock.combineAsVariants).toHaveBeenCalledWith(
      [surviving, created],
      expect.anything(),
    );
  });

  it('reacquires variant masters after combineAsVariants invalidates their proxies', async () => {
    const stableIds = ['TestComponent/default', 'TestComponent/active'];
    const staleMasters = stableIds.map((stableId, index) => component(`master-${index}`, stableId));
    const liveMasters = stableIds.map((stableId, index) => component(`master-${index}`, stableId));
    const setPluginData = new Map<string, string>();
    const combined = {
      id: 'combined-set',
      type: 'COMPONENT_SET',
      children: liveMasters,
      componentPropertyDefinitions: {},
      getPluginData: (key: string) => setPluginData.get(key) ?? '',
      setPluginData: (key: string, value: string) => setPluginData.set(key, value),
    } as unknown as ComponentSetNode;
    vi.stubGlobal('figma', {
      currentPage: {
        findAllWithCriteria: ({ types }: { types: NodeType[] }) =>
          types.includes('COMPONENT') ? staleMasters : [],
      },
      getNodeByIdAsync: vi.fn(
        async (id: string) => liveMasters.find((candidate) => candidate.id === id) ?? null,
      ),
      createComponent: vi.fn(),
      combineAsVariants: vi.fn(() => combined),
    });
    vi.mocked(reconcileNestedSlotOverrides).mockImplementation(async (candidate) => {
      if (staleMasters.includes(candidate)) {
        throw new Error('in set_name: Internal Figma Error: Node not found');
      }
    });
    const { spec, ir, resources } = importFixture(stableIds);

    await expect(
      upsertComponentSet(
        ir,
        spec,
        {} as SectionNode,
        resources,
        new Map([[spec.component, spec]]),
        24,
      ),
    ).resolves.toBe(combined);

    expect(reconcileNestedSlotOverrides).toHaveBeenNthCalledWith(
      1,
      liveMasters[0],
      ir.components.TestComponent![0],
      spec,
      ir,
      resources,
      expect.anything(),
      expect.any(Function),
    );
    expect(reconcileNestedSlotOverrides).toHaveBeenNthCalledWith(
      2,
      liveMasters[1],
      ir.components.TestComponent![1],
      spec,
      ir,
      resources,
      expect.anything(),
      expect.any(Function),
    );
  });

  it('reacquires a master and retries once when configuration sees an invalidated proxy', async () => {
    const stableId = 'TestComponent/default';
    const stale = component('master', stableId);
    const live = component('master', stableId);
    const combined = {
      type: 'COMPONENT_SET',
      children: [live],
      componentPropertyDefinitions: {},
      getPluginData: vi.fn(() => ''),
      setPluginData: vi.fn(),
    } as unknown as ComponentSetNode;
    let lookupCount = 0;
    vi.stubGlobal('figma', {
      currentPage: {
        findAllWithCriteria: ({ types }: { types: NodeType[] }) =>
          types.includes('COMPONENT') ? [lookupCount ? live : stale] : [],
      },
      getNodeByIdAsync: vi.fn(async () => (lookupCount++ ? live : stale)),
      createComponent: vi.fn(),
      combineAsVariants: vi.fn(() => combined),
    });
    vi.mocked(configureComponent).mockImplementation(async (candidate) => {
      if (candidate === stale) throw new Error('in set_name: Internal Figma Error: Node not found');
    });
    const { spec, ir, resources } = importFixture([stableId]);

    await expect(
      upsertComponentSet(
        ir,
        spec,
        {} as SectionNode,
        resources,
        new Map([[spec.component, spec]]),
        24,
      ),
    ).resolves.toBe(combined);

    expect(configureComponent).toHaveBeenNthCalledWith(
      1,
      stale,
      expect.anything(),
      spec,
      ir,
      resources,
      expect.anything(),
    );
    expect(configureComponent).toHaveBeenNthCalledWith(
      2,
      live,
      expect.anything(),
      spec,
      ir,
      resources,
      expect.anything(),
    );
  });

  it('uses a bounded second reacquisition when Figma returns another invalid proxy', async () => {
    const stableId = 'OpaqueComponent/default';
    const stale = component('master', stableId);
    const staleAgain = component('master', stableId);
    const live = component('master', stableId);
    const candidates = [stale, staleAgain, live];
    const combined = {
      type: 'COMPONENT_SET',
      children: [live],
      componentPropertyDefinitions: {},
      getPluginData: vi.fn(() => ''),
      setPluginData: vi.fn(),
    } as unknown as ComponentSetNode;
    let lookupCount = 0;
    vi.stubGlobal('figma', {
      currentPage: {
        findAllWithCriteria: ({ types }: { types: NodeType[] }) =>
          types.includes('COMPONENT') ? [candidates[Math.min(lookupCount, 2)]] : [],
      },
      getNodeByIdAsync: vi.fn(async () => candidates[Math.min(lookupCount++, 2)]),
      createComponent: vi.fn(),
      combineAsVariants: vi.fn(() => combined),
    });
    vi.mocked(configureComponent).mockImplementation(async (candidate) => {
      if (candidate !== live) throw new Error('in set_name: Internal Figma Error: Node not found');
    });
    const { spec, ir, resources } = importFixture([stableId]);

    await expect(
      upsertComponentSet(
        ir,
        spec,
        {} as SectionNode,
        resources,
        new Map([[spec.component, spec]]),
        24,
      ),
    ).resolves.toBe(combined);

    // Three bounded retries resolve the live node; the final call deliberately
    // re-applies canonical geometry after combineAsVariants has parented it.
    expect(configureComponent).toHaveBeenCalledTimes(4);
    expect(configureComponent).toHaveBeenLastCalledWith(
      live,
      expect.anything(),
      spec,
      ir,
      resources,
      expect.anything(),
    );
  });
});
