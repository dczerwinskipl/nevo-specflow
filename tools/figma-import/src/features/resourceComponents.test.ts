import { afterEach, describe, expect, it, vi } from 'vitest';
import { DATA_KEY } from '../core/model';
import type { DesignSystemIR, DesignResources } from '../core/model';
import type { ResourceCatalogDefinition } from '@nevo/figma-core/authoring';
import { repairSetIfNeeded, upsertTextStyleCatalog } from './resourceComponents';

vi.mock('./overviews', () => ({ layoutSetMatrix: vi.fn() }));

function component(id: string, stableId: string) {
  return {
    id,
    type: 'COMPONENT',
    removed: false,
    name: id,
    getPluginData: (key: string) => (key === DATA_KEY ? stableId : ''),
  } as unknown as ComponentNode;
}

describe('component-set repair', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('repairs a set without reading children from its broken proxy', async () => {
    const stableId = 'Icon/search/sm';
    const master = component('live-master', stableId);
    const set = { id: 'broken-set', type: 'COMPONENT_SET', removed: false } as ComponentSetNode;
    const childrenRead = vi.fn();
    Object.defineProperties(set, {
      componentPropertyDefinitions: {
        get: () => {
          throw new Error('broken component set');
        },
      },
      children: {
        get: () => {
          childrenRead();
          throw new Error('Node not found');
        },
      },
    });
    const section = { appendChild: vi.fn() } as unknown as SectionNode;
    const repaired = {
      type: 'COMPONENT_SET',
      setPluginData: vi.fn(),
    } as unknown as ComponentSetNode;
    vi.stubGlobal('figma', {
      currentPage: {
        findAllWithCriteria: ({ types }: { types: NodeType[] }) =>
          types.includes(master.type) ? [master] : [],
      },
      getNodeByIdAsync: vi.fn(async (id: string) => (id === set.id ? set : master)),
      combineAsVariants: vi.fn(() => repaired),
    });

    await expect(
      repairSetIfNeeded(
        set,
        section,
        'Icon/set',
        [stableId],
        undefined,
        () => 'Name=search, Size=sm',
      ),
    ).resolves.toBe(repaired);
    expect(childrenRead).not.toHaveBeenCalled();
    expect(master.name).toBe('Name=search, Size=sm');
  });

  it('reacquires live masters after moving them invalidates cached proxies', async () => {
    const stableId = 'Icon/search/sm';
    let moved = false;
    const staleMaster = component('stale-master', stableId);
    Object.defineProperty(staleMaster, 'name', {
      get: () => 'stale',
      set: () => {
        if (moved) throw new Error('Node not found');
      },
    });
    const liveMaster = component('live-master', stableId);
    const set = { id: 'broken-set', type: 'COMPONENT_SET', removed: false } as ComponentSetNode;
    Object.defineProperty(set, 'componentPropertyDefinitions', {
      get: () => {
        throw new Error('broken component set');
      },
    });
    const section = {
      appendChild: vi.fn(() => {
        moved = true;
      }),
    } as unknown as SectionNode;
    const repaired = {
      type: 'COMPONENT_SET',
      setPluginData: vi.fn(),
    } as unknown as ComponentSetNode;
    vi.stubGlobal('figma', {
      currentPage: {
        findAllWithCriteria: ({ types }: { types: NodeType[] }) => {
          const candidate = moved ? liveMaster : staleMaster;
          return types.includes(candidate.type) ? [candidate] : [];
        },
      },
      getNodeByIdAsync: vi.fn(async (id: string) => {
        if (id === set.id) return set;
        return moved ? liveMaster : staleMaster;
      }),
      combineAsVariants: vi.fn((masters: ComponentNode[]) => {
        expect(masters).toEqual([liveMaster]);
        return repaired;
      }),
    });

    await expect(
      repairSetIfNeeded(
        set,
        section,
        'Icon/set',
        [stableId],
        undefined,
        () => 'Name=search, Size=sm',
      ),
    ).resolves.toBe(repaired);
    expect(liveMaster.name).toBe('Name=search, Size=sm');
  });

  it('reacquires a master again when its first post-move proxy fails during naming', async () => {
    const stableId = 'OpaqueComponent/default';
    let moved = false;
    let postMoveLookupCount = 0;
    const beforeMove = component('before-move', stableId);
    const invalidatedAfterMove = component('invalidated-after-move', stableId);
    Object.defineProperty(invalidatedAfterMove, 'name', {
      get: () => 'stale',
      set: () => {
        throw new Error('in set_name: Internal Figma Error: Node not found');
      },
    });
    const liveAfterRetry = component('live-after-retry', stableId);
    const set = { id: 'broken-set', type: 'COMPONENT_SET', removed: false } as ComponentSetNode;
    Object.defineProperty(set, 'componentPropertyDefinitions', {
      get: () => {
        throw new Error('broken component set');
      },
    });
    const section = {
      appendChild: vi.fn(() => {
        moved = true;
      }),
    } as unknown as SectionNode;
    const repaired = {
      type: 'COMPONENT_SET',
      setPluginData: vi.fn(),
    } as unknown as ComponentSetNode;
    vi.stubGlobal('figma', {
      currentPage: {
        findAllWithCriteria: ({ types }: { types: NodeType[] }) =>
          types.includes('COMPONENT') ? [beforeMove] : [],
      },
      getNodeByIdAsync: vi.fn(async (id: string) => {
        if (id === set.id) return set;
        if (!moved) return beforeMove;
        postMoveLookupCount += 1;
        return postMoveLookupCount === 1 ? invalidatedAfterMove : liveAfterRetry;
      }),
      combineAsVariants: vi.fn((masters: ComponentNode[]) => {
        expect(masters).toEqual([liveAfterRetry]);
        return repaired;
      }),
    });

    await expect(
      repairSetIfNeeded(
        set,
        section,
        'OpaqueComponent/set',
        [stableId],
        undefined,
        () => 'State=default',
      ),
    ).resolves.toBe(repaired);

    expect(liveAfterRetry.name).toBe('State=default');
    expect(postMoveLookupCount).toBe(2);
  });
});

describe('text-style catalog reconstruction', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rebuilds a missing catalog set from masters that already exist', async () => {
    const resourceIds = ['Typography/body-sm', 'Typography/body-md'];
    const catalogIds = resourceIds.map((stableId) => `${stableId}/presentation`);
    const samples = resourceIds.map((stableId, index) => {
      const pluginData = new Map<string, string>([[DATA_KEY, `${stableId}/sample`]]);
      return {
        id: `sample-${index}`,
        type: 'TEXT',
        name: 'text',
        getPluginData: (key: string) => pluginData.get(key) ?? '',
        setPluginData: (key: string, value: string) => pluginData.set(key, value),
        setTextStyleIdAsync: vi.fn(async () => undefined),
        componentPropertyReferences: {},
      } as unknown as TextNode;
    });
    const masters = catalogIds.map(
      (stableId, index) =>
        ({
          ...component(`master-${index}`, stableId),
          children: [samples[index]],
          parent: undefined,
        }) as unknown as ComponentNode,
    );
    const combined = {
      type: 'COMPONENT_SET',
      children: masters,
      componentPropertyDefinitions: {},
      addComponentProperty: vi.fn(() => 'Text#property'),
      setPluginData: vi.fn(),
    } as unknown as ComponentSetNode;
    const createComponent = vi.fn();
    const combineAsVariants = vi.fn(() => combined);
    vi.stubGlobal('figma', {
      currentPage: {
        findAllWithCriteria: ({ types }: { types: NodeType[] }) =>
          masters.filter((master) => types.includes(master.type)),
      },
      getNodeByIdAsync: vi.fn(
        async (id: string) => masters.find((master) => master.id === id) ?? null,
      ),
      createComponent,
      combineAsVariants,
    });
    const ir = {
      resources: {
        colors: [],
        assets: [],
        textStyles: resourceIds.map((stableId) => ({
          stableId,
          name: stableId,
        })),
      },
    } as unknown as DesignSystemIR;
    const resources = {
      colors: new Map(),
      assets: new Map(),
      textStyles: new Map(
        resourceIds.map((stableId) => [
          stableId,
          {
            id: `${stableId}/style`,
            fontName: { family: 'Inter', style: 'Regular' },
          } as TextStyle,
        ]),
      ),
    } satisfies DesignResources;
    const catalog = {
      kind: 'text-style',
      setStableId: 'Typography/set',
      name: 'Text styles',
      columnAxis: { name: 'Role', values: ['body'] },
      rowAxis: { name: 'Size', values: ['sm', 'md'] },
      items: resourceIds.map((resourceRef, index) => ({
        resourceRef,
        column: 'body',
        row: index === 0 ? 'sm' : 'md',
        sample: 'Sample',
      })),
    } satisfies ResourceCatalogDefinition;

    await expect(
      upsertTextStyleCatalog(ir, {} as SectionNode, resources, 24, catalog),
    ).resolves.toBe(combined);

    expect(createComponent).not.toHaveBeenCalled();
    expect(combineAsVariants).toHaveBeenCalledWith(masters, expect.anything());
  });
});
