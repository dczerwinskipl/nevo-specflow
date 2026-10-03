import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPaint,
  applyOpacity,
  applyStroke,
  canBindPaintVariable,
  findLiveChild,
  findStable,
  parseBackgroundGradients,
  parseRadialGradient,
  removeWrongTypeSibling,
  solidPaintForVariableBinding,
} from './figmaNodes';
import { DATA_KEY } from './model';

const applicationBackground = [
  'radial-gradient(ellipse 64% 48% at 12% 0%, rgba(37, 92, 219, 0.082) 0%, rgba(43, 107, 255, 0.026) 44%, transparent 74%)',
  'radial-gradient(ellipse 44% 34% at 100% 100%, rgba(28, 71, 168, 0.04) 0%, transparent 72%)',
].join(', ');
const workspaceBackground =
  'radial-gradient(ellipse 34% 24% at 0% 0%, rgba(255, 255, 255, 0.055) 0%, rgba(255, 255, 255, 0.016) 42%, transparent 72%)';

afterEach(() => vi.unstubAllGlobals());

describe('stable node lookup', () => {
  it('avoids callback traversal and skips invalidated node proxies', () => {
    const stale = {
      type: 'COMPONENT',
      getPluginData: () => {
        throw new Error('Node not found');
      },
    } as unknown as ComponentNode;
    const live = {
      type: 'COMPONENT',
      getPluginData: (key: string) => (key === DATA_KEY ? 'Icon/search/sm' : ''),
    } as unknown as ComponentNode;
    const findOne = vi.fn(() => {
      throw new Error('callback traversal must not run');
    });
    const findAllWithCriteria = vi.fn(() => [stale, live]);
    vi.stubGlobal('figma', {
      currentPage: { findOne, findAllWithCriteria },
    });

    expect(findStable<ComponentNode>('Icon/search/sm', ['COMPONENT'])).toBe(live);
    expect(findOne).not.toHaveBeenCalled();
    expect(findAllWithCriteria).toHaveBeenCalledWith({
      types: ['COMPONENT'],
      pluginData: { keys: [DATA_KEY] },
    });
  });

  it('reacquires a nested child before a repeated import mutates plugin data', async () => {
    const setPluginData = vi.fn();
    const stale = {
      id: 'nested-instance',
      type: 'INSTANCE',
      getPluginData: (key: string) => (key === DATA_KEY ? 'Screen/child/0' : ''),
      setPluginData: () => {
        throw new Error('Node not found');
      },
    } as unknown as InstanceNode;
    const live = {
      id: 'nested-instance',
      type: 'INSTANCE',
      getPluginData: (key: string) => (key === DATA_KEY ? 'Screen/child/0' : ''),
      setPluginData,
    } as unknown as InstanceNode;
    vi.stubGlobal('figma', {
      getNodeByIdAsync: vi.fn(async () => live),
    });

    const resolved = await findLiveChild<InstanceNode>(
      { children: [stale] } as unknown as ChildrenMixin,
      'Screen/child/0',
      ['INSTANCE'],
    );
    resolved?.setPluginData('nevoManaged', 'true');

    expect(resolved).toBe(live);
    expect(setPluginData).toHaveBeenCalledWith('nevoManaged', 'true');
  });
});

describe('environment gradient projection', () => {
  it('maps every application and workspace layer into Figma gradient paints', () => {
    const appPaints = parseBackgroundGradients(applicationBackground);
    const workspacePaints = parseBackgroundGradients(workspaceBackground);

    expect(appPaints.map((paint) => paint.type)).toEqual(['GRADIENT_RADIAL', 'GRADIENT_RADIAL']);
    expect(workspacePaints.map((paint) => paint.type)).toEqual(['GRADIENT_RADIAL']);
  });

  it('preserves the workspace highlight geometry and exact translucent stops', () => {
    const [paint] = parseBackgroundGradients(workspaceBackground);

    expect(paint).toMatchObject({
      type: 'GRADIENT_RADIAL',
      gradientTransform: [
        [0.5 / 0.34, 0, 0.5],
        [0, 0.5 / 0.24, 0.5],
      ],
      gradientStops: [
        { position: 0, color: { r: 1, g: 1, b: 1, a: 0.055 } },
        { position: 0.42, color: { r: 1, g: 1, b: 1, a: 0.016 } },
        { position: 0.72, color: { r: 0, g: 0, b: 0, a: 0 } },
      ],
    });
  });

  it('preserves both application ambient gradients, centers and radii', () => {
    const [topLeft, bottomRight] = parseBackgroundGradients(applicationBackground);

    expect(topLeft).toMatchObject({
      type: 'GRADIENT_RADIAL',
      gradientTransform: [
        [0.5 / 0.64, 0, 0.5 - (0.5 / 0.64) * 0.12],
        [0, 0.5 / 0.48, 0.5],
      ],
      gradientStops: [
        { position: 0, color: { r: 37 / 255, g: 92 / 255, b: 219 / 255, a: 0.082 } },
        { position: 0.44, color: { r: 43 / 255, g: 107 / 255, b: 1, a: 0.026 } },
        { position: 0.74, color: { r: 0, g: 0, b: 0, a: 0 } },
      ],
    });
    expect(bottomRight).toMatchObject({
      type: 'GRADIENT_RADIAL',
      gradientTransform: [
        [0.5 / 0.44, 0, 0.5 - 0.5 / 0.44],
        [0, 0.5 / 0.34, 0.5 - 0.5 / 0.34],
      ],
      gradientStops: [
        { position: 0, color: { r: 28 / 255, g: 71 / 255, b: 168 / 255, a: 0.04 } },
        { position: 0.72, color: { r: 0, g: 0, b: 0, a: 0 } },
      ],
    });
  });

  it('keeps gradients in front of the base surface paint', () => {
    const node = { fills: [] } as unknown as GeometryMixin;

    applyPaint(
      node,
      {
        backgroundColor: 'rgba(255, 255, 255, 0.028)',
        backgroundImage: workspaceBackground,
      },
      'backgroundColor',
    );

    const fills = node.fills;
    if (!Array.isArray(fills)) throw new Error('Expected concrete paints after projection.');
    expect(fills).toHaveLength(2);
    expect(fills[0]).toMatchObject({ type: 'GRADIENT_RADIAL' });
    expect(fills[1]).toMatchObject({ type: 'SOLID', opacity: 0.028 });
  });
});

describe('element opacity projection', () => {
  it('converges independently from paint alpha across reimports', () => {
    const node = { opacity: 1 } as MinimalBlendMixin;
    applyOpacity(node, { opacity: '0.5' });
    expect(node.opacity).toBe(0.5);
    applyOpacity(node, { opacity: '1' });
    expect(node.opacity).toBe(1);
  });
});

describe('per-edge border projection', () => {
  it('uses the visible edge color and drops transparent sibling edges', () => {
    const node = {
      strokes: [],
      strokeWeight: 0,
      strokeTopWeight: 0,
      strokeRightWeight: 0,
      strokeBottomWeight: 0,
      strokeLeftWeight: 0,
      strokeAlign: 'CENTER',
    } as unknown as GeometryMixin & MinimalStrokesMixin;

    applyStroke(node, {
      borderTopWidth: '2px',
      borderRightWidth: '2px',
      borderBottomWidth: '2px',
      borderLeftWidth: '2px',
      borderTopColor: 'rgba(0, 0, 0, 0)',
      borderRightColor: 'rgba(0, 0, 0, 0)',
      borderBottomColor: 'rgb(37, 99, 235)',
      borderLeftColor: 'rgba(0, 0, 0, 0)',
    });

    expect(node.strokes).toEqual([
      expect.objectContaining({ color: { r: 37 / 255, g: 99 / 255, b: 235 / 255 } }),
    ]);
    expect((node as unknown as IndividualStrokesMixin).strokeTopWeight).toBe(0);
    expect((node as unknown as IndividualStrokesMixin).strokeRightWeight).toBe(0);
    expect((node as unknown as IndividualStrokesMixin).strokeBottomWeight).toBe(2);
    expect((node as unknown as IndividualStrokesMixin).strokeLeftWeight).toBe(0);
  });
});

describe('stable layer type migration', () => {
  it('removes only the obsolete node proxy before an upsert', async () => {
    const obsolete = {
      type: 'TEXT',
      getPluginData: (key: string) => (key.includes('Managed') ? 'true' : 'Task/slot/indicator'),
      remove: vi.fn(),
    } as unknown as TextNode;
    const current = {
      type: 'FRAME',
      getPluginData: (key: string) => (key.includes('Managed') ? 'true' : 'Task/slot/indicator'),
      remove: vi.fn(),
    } as unknown as FrameNode;
    vi.stubGlobal('figma', {
      getNodeByIdAsync: vi.fn(async (id: string) => (id === 'obsolete' ? obsolete : current)),
    });
    Object.assign(obsolete, { id: 'obsolete' });
    Object.assign(current, { id: 'current' });
    await removeWrongTypeSibling(
      { children: [obsolete, current] } as unknown as ChildrenMixin,
      'Task/slot/indicator',
      ['FRAME'],
    );
    expect(obsolete.remove).toHaveBeenCalledOnce();
    expect(current.remove).not.toHaveBeenCalled();
  });
});

describe('paint variable binding', () => {
  it.each([0.1, 0.2])('keeps translucent semantic paint %s literal', (opacity) => {
    const paint = solidPaintForVariableBinding({
      type: 'SOLID',
      color: { r: 0.1, g: 0.2, b: 0.3 },
      opacity,
    });
    expect(canBindPaintVariable(paint)).toBe(false);
  });

  it('continues to bind opaque semantic paints', () => {
    expect(
      canBindPaintVariable({
        type: 'SOLID',
        color: { r: 0.1, g: 0.2, b: 0.3 },
        opacity: 1,
      }),
    ).toBe(true);
  });
});

describe('radial gradient projection', () => {
  it('maps CSS center and elliptical radii into Figma inverse gradient space', () => {
    const paint = parseRadialGradient(
      'radial-gradient(65% 48% at 0% 0%, rgba(255, 255, 255, 0.04) 0%, transparent 62%)',
    );
    expect(paint?.gradientTransform).toEqual([
      [0.5 / 0.65, 0, 0.5],
      [0, 0.5 / 0.48, 0.5],
    ]);
  });

  it('keeps an offset CSS center at the requested normalized handle position', () => {
    const paint = parseRadialGradient(
      'radial-gradient(75% 55% at 12% -12%, #fff 0%, transparent 68%)',
    );
    const transform = paint!.gradientTransform;
    expect(transform[0][0] * 0.12 + transform[0][2]).toBeCloseTo(0.5);
    expect(transform[1][1] * -0.12 + transform[1][2]).toBeCloseTo(0.5);
  });
});
