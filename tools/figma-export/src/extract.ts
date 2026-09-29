import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import type { ComponentCaptureIR, DesignSystemIR, ScreensIR } from '@nevo/figma-core/ir';
import { validateIR } from '@nevo/figma-core/schema';
import {
  collectCssProjectionDiagnostics,
  stripDiagnosticOnlyStyleProperties,
} from './cssProjectionDiagnostics';

function numberFromEnvironment(name: string, fallback: number) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`);
  return parsed;
}

const host = process.env.NEVO_CAPTURE_HOST ?? '127.0.0.1';
const port = numberFromEnvironment('NEVO_CAPTURE_PORT', 4173);
const captureViewport = {
  width: numberFromEnvironment('NEVO_CAPTURE_WIDTH', 1440),
  height: numberFromEnvironment('NEVO_CAPTURE_HEIGHT', 1400),
  deviceScaleFactor: numberFromEnvironment('NEVO_CAPTURE_DEVICE_SCALE_FACTOR', 1),
};
const projectSource = {
  name: process.env.NEVO_CAPTURE_SOURCE_NAME ?? 'Code capture',
  reference: process.env.NEVO_CAPTURE_SOURCE_REFERENCE ?? 'local',
  route: process.env.NEVO_CAPTURE_SOURCE_ROUTE ?? '/',
};
const baseUrl = process.env.NEVO_CAPTURE_URL ?? `http://${host}:${port}`;
const designOutputPath = path.resolve(
  process.cwd(),
  process.env.NEVO_DESIGN_IR_OUT ?? 'generated/design-system.ir.json',
);
const screensOutputPath = path.resolve(
  process.cwd(),
  process.env.NEVO_SCREENS_IR_OUT ?? 'generated/screens.ir.json',
);

async function waitForServer(url: string, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startVite(): ChildProcess {
  const viteEntry = path.resolve(process.cwd(), 'node_modules/vite/bin/vite.js');
  return spawn(process.execPath, [viteEntry, '--host', host, '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function extract(): Promise<DesignSystemIR> {
  const browser = await chromium.launch({ headless: true });
  try {
    const { width, height, deviceScaleFactor } = captureViewport;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate('globalThis.__name = (target) => target');

    const captured = await page.evaluate((projectSource) => {
      const registryNode = document.querySelector<HTMLScriptElement>('#design-capture-registry');
      if (!registryNode?.textContent) throw new Error('Missing #design-capture-registry');
      const registry = JSON.parse(registryNode.textContent) as {
        definitions: {
          component: string;
          description?: string;
          target?: 'component' | 'fragment' | 'screen';
          order: number;
          variantProperties: string[];
          propertyValues: Record<string, (string | number | boolean)[]>;
          defaultProperties?: Record<string, string | number | boolean>;
          slots: Record<
            string,
            {
              kind: 'text' | 'asset-swap' | 'container' | 'slot';
              propertyName?: string;
              required?: boolean;
              defaultText?: string;
              defaultAssetRefs?: Record<string, string>;
              variantProperty?: string;
            }
          >;
          bindings?: Record<string, { property: string; values: Record<string, string> }>;
          figma?: { root?: { layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' } };
        }[];
        colorTokens: { stableId: string; name: string; cssVariable: string }[];
      };
      const definitionNames = new Set(
        registry.definitions.map((definition) => definition.component),
      );
      const boxProperties = [
        'display',
        'width',
        'height',
        'minWidth',
        'minHeight',
        'maxWidth',
        'maxHeight',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'gap',
        'rowGap',
        'columnGap',
        'flexDirection',
        'flexWrap',
        'alignItems',
        'justifyContent',
        'gridTemplateColumns',
        'gridAutoFlow',
        'position',
        'top',
        'right',
        'bottom',
        'left',
        'zIndex',
        'transform',
        'isolation',
        'overflow',
        'visibility',
        'backgroundColor',
        'backgroundImage',
        'color',
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth',
        'borderTopColor',
        'borderRightColor',
        'borderBottomColor',
        'borderLeftColor',
        'borderTopStyle',
        'borderRightStyle',
        'borderBottomStyle',
        'borderLeftStyle',
        'outlineWidth',
        'outlineStyle',
        'outlineColor',
        'borderRadius',
        'borderTopLeftRadius',
        'borderTopRightRadius',
        'borderBottomRightRadius',
        'borderBottomLeftRadius',
        'opacity',
        'animationName',
        'animationDuration',
        'animationTimingFunction',
        'animationIterationCount',
      ] as const;
      const textProperties = [
        'display',
        'width',
        'height',
        'color',
        'fontFamily',
        'fontSize',
        'fontWeight',
        'lineHeight',
        'letterSpacing',
        'textTransform',
        'textDecorationLine',
        'textAlign',
        'position',
        'top',
        'right',
        'bottom',
        'left',
        'zIndex',
      ] as const;
      const pick = <T extends readonly string[]>(style: CSSStyleDeclaration, names: T) =>
        Object.fromEntries(
          names.map((name) => [name, (style as unknown as Record<string, string>)[name] ?? '']),
        );
      const isExcludedFromVisualCapture = (node: Element, style = getComputedStyle(node)) => {
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse'
        ) {
          return true;
        }
        const clip = style.getPropertyValue('clip').replaceAll(' ', '');
        const clipPath = style.clipPath.replaceAll(' ', '');
        return (
          clip === 'rect(0px,0px,0px,0px)' || clip === 'rect(0,0,0,0)' || clipPath === 'inset(50%)'
        );
      };
      const typedDimension = (node: Element, property: 'width' | 'height') => {
        const typedNode = node as Element & {
          computedStyleMap?: () => {
            get: (name: string) => { toString: () => string } | undefined;
          };
        };
        return typedNode.computedStyleMap?.().get(property)?.toString() ?? '';
      };
      const diagnostics: {
        code:
          | 'unsupported-grid'
          | 'non-uniform-spacing'
          | 'unsupported-effect'
          | 'unsupported-transform'
          | 'unsupported-fixed-position'
          | 'unsupported-stacking-context'
          | 'unsupported-containing-block';
        severity: 'warning';
        message: string;
        component?: string;
        layer?: string;
      }[] = [];
      const diagnosticKeys = new Set<string>();
      const report = (
        node: Element,
        code:
          | 'unsupported-grid'
          | 'non-uniform-spacing'
          | 'unsupported-effect'
          | 'unsupported-transform'
          | 'unsupported-fixed-position'
          | 'unsupported-stacking-context'
          | 'unsupported-containing-block',
        message: string,
      ) => {
        const element = node as HTMLElement;
        const layer =
          element.dataset.designLayer ??
          element.dataset.designComponent ??
          element.getAttribute('aria-label') ??
          element.tagName.toLowerCase();
        const captureRoot = element.closest<HTMLElement>('[data-design-capture="true"]');
        const component = captureRoot?.dataset.designComponent ?? element.dataset.designComponent;
        const key = `${code}/${component}/${layer}/${message}`;
        if (diagnosticKeys.has(key)) return;
        diagnosticKeys.add(key);
        diagnostics.push({ code, severity: 'warning', message, component, layer });
      };
      const axisSizing = (node: Element, property: 'width' | 'height') => {
        const value = typedDimension(node, property);
        const intrinsic =
          value.includes('fit-content') ||
          value.includes('max-content') ||
          value.includes('min-content');
        if (intrinsic) {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          const measured = property === 'width' ? rect.width : rect.height;
          const minimum = property === 'width' ? style.minWidth : style.minHeight;
          const maximum = property === 'width' ? style.maxWidth : style.maxHeight;
          const reachesFiniteConstraint = [minimum, maximum].some((constraint) => {
            if (!constraint.endsWith('px')) return false;
            const pixels = Number.parseFloat(constraint);
            return Number.isFinite(pixels) && pixels > 0 && Math.abs(measured - pixels) <= 0.75;
          });
          // CSS intrinsic sizing can still resolve to a product-layout boundary,
          // for example `width: max-content; max-width: 75%`. Figma Hug would
          // recompute that layer from its tiny placeholder content and collapse
          // the workspace. Preserve the browser-resolved boundary as Fixed.
          if (reachesFiniteConstraint) return 'fixed';
          return 'hug';
        }
        if (value.includes('%')) {
          // A partial percentage (Progress 37%, 65%, etc.) is canonical
          // geometry, not Figma Fill. Only a full-width percentage carries
          // the same layout intent as Fill in the supported subset.
          return Number.parseFloat(value) >= 99.999 ? 'fill' : 'fixed';
        }
        if (value !== 'auto') return 'fixed';
        const parent = node.parentElement;
        if (!parent) return 'hug';
        const parentStyle = getComputedStyle(parent);
        const ownStyle = getComputedStyle(node);
        const parentIsFlex = parentStyle.display.includes('flex');
        const parentIsVerticalFlex = parentIsFlex && parentStyle.flexDirection === 'column';
        const stretches =
          ['normal', 'stretch'].includes(parentStyle.alignItems) &&
          ['auto', 'normal', 'stretch'].includes(ownStyle.alignSelf);
        if (parentIsFlex) {
          if (property === 'width') {
            if (parentIsVerticalFlex) return stretches ? 'fill' : 'hug';
            return Number.parseFloat(ownStyle.flexGrow) > 0 ? 'fill' : 'hug';
          }
          if (!parentIsVerticalFlex) return stretches ? 'fill' : 'hug';
          return Number.parseFloat(ownStyle.flexGrow) > 0 ? 'fill' : 'hug';
        }
        if (property === 'height') return 'hug';
        const blockLevelAutoWidth = new Set([
          'block',
          'flow-root',
          'flex',
          'grid',
          'table',
          'table-row',
          'table-row-group',
          'table-header-group',
          'table-footer-group',
        ]).has(ownStyle.display);
        if (blockLevelAutoWidth) {
          const parentWidth = typedDimension(parent, 'width');
          // A block inside an intrinsic-width surface supplies the measurement
          // from which that surface is sized. Figma Fill inside Hug has no
          // equivalent constraint chain, so preserve the browser measurement.
          if (
            parentWidth.includes('fit-content') ||
            parentWidth.includes('max-content') ||
            parentWidth.includes('min-content')
          ) {
            return 'fixed';
          }
          return 'fill';
        }
        return 'hug';
      };
      const visibleFlowChildren = (node: Element) =>
        Array.from(node.children).filter((child) => {
          const childStyle = getComputedStyle(child);
          return (
            !isExcludedFromVisualCapture(child, childStyle) &&
            childStyle.position !== 'absolute' &&
            childStyle.position !== 'fixed'
          );
        });
      const isInlineDisplay = (display: string) =>
        display === 'inline' || display.startsWith('inline-');
      const isInlineFormattingContext = (node: Element, style = getComputedStyle(node)) => {
        if (style.display.includes('flex') || style.display.includes('grid')) return false;
        const visibleNodes = Array.from(node.childNodes).filter((child) => {
          if (child.nodeType === Node.TEXT_NODE) return Boolean(child.textContent?.trim());
          return child instanceof Element && !isExcludedFromVisualCapture(child);
        });
        return (
          visibleNodes.length > 0 &&
          visibleNodes.every(
            (child) =>
              child.nodeType === Node.TEXT_NODE ||
              (child instanceof Element && isInlineDisplay(getComputedStyle(child).display)),
          )
        );
      };
      const isNativeInlineTextFlow = (element: HTMLElement) => {
        if (!isInlineFormattingContext(element)) return false;
        const textualTags = new Set([
          'A',
          'B',
          'CODE',
          'DEL',
          'EM',
          'I',
          'S',
          'SMALL',
          'SPAN',
          'STRONG',
        ]);
        return Array.from(element.querySelectorAll<HTMLElement>('*')).every(
          (child) =>
            textualTags.has(child.tagName) &&
            !child.dataset.designAssetRef &&
            !child.dataset.designSlot &&
            !child.dataset.designLayer &&
            !definitionNames.has(child.dataset.designComponent ?? ''),
        );
      };
      const flowDirectionOf = (node: Element, style = getComputedStyle(node)) => {
        if (style.display.includes('flex'))
          return style.flexDirection === 'column' ? 'vertical' : 'horizontal';
        if (style.display.includes('grid')) {
          const columns = style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
          return columns <= 1 ? 'vertical' : 'horizontal';
        }
        // CSS table layout has its own formatting context. A table and its row
        // groups stack vertically, while the cells of a table row are laid out
        // horizontally. Treating every non-inline display as vertical collapses
        // real tables into a single narrow column in Figma even though the IR
        // still contains the browser-measured cell widths.
        if (style.display === 'table-row') return 'horizontal';
        if (
          style.display === 'table' ||
          style.display === 'inline-table' ||
          style.display === 'table-header-group' ||
          style.display === 'table-row-group' ||
          style.display === 'table-footer-group'
        )
          return 'vertical';
        return style.display === 'inline' || isInlineFormattingContext(node)
          ? 'horizontal'
          : 'vertical';
      };
      const isTwoDimensionalGrid = (node: Element) => {
        const style = getComputedStyle(node);
        if (!style.display.includes('grid')) return false;
        const rects = visibleFlowChildren(node).map((child) => child.getBoundingClientRect());
        const rows = new Set(rects.map((rect) => Math.round(rect.top))).size;
        const columns = new Set(rects.map((rect) => Math.round(rect.left))).size;
        return rows > 1 && columns > 1;
      };
      const gridTrackCount = (value: string) =>
        value === 'none' ? 0 : value.trim().split(/\s+/).filter(Boolean).length;
      const box = (node: Element) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const parentRect = node.parentElement?.getBoundingClientRect();
        const parentDefinition = registry.definitions.find(
          (definition) => definition.component === node.parentElement?.dataset.designComponent,
        );
        const fixedCanvasChild = parentDefinition?.figma?.root?.layoutMode === 'NONE';
        const parentStyle = node.parentElement ? getComputedStyle(node.parentElement) : undefined;
        const gridChild = Boolean(parentStyle?.display.includes('grid'));
        const measuredGridWidthChild = Boolean(
          gridChild && parentStyle && gridTrackCount(parentStyle.gridTemplateColumns) > 1,
        );
        const measuredGridChild = Boolean(
          node.parentElement && isTwoDimensionalGrid(node.parentElement),
        );
        const result: Record<string, string> = {
          ...pick(style, boxProperties),
          cssWidth: typedDimension(node, 'width'),
          cssHeight: typedDimension(node, 'height'),
          widthSizing:
            measuredGridWidthChild || measuredGridChild || style.display === 'table-cell'
              ? 'fixed'
              : axisSizing(node, 'width'),
          // Browser table layout equalizes every cell to its row's used height.
          // A Figma Auto Layout cell has no equivalent table formatting context,
          // so preserve that measured height instead of letting each cell hug
          // independently around text, badges, or controls.
          heightSizing:
            measuredGridChild || style.display === 'table-cell'
              ? 'fixed'
              : axisSizing(node, 'height'),
          flowDirection: flowDirectionOf(node, style),
          ...(style.display === 'table-cell' ? { verticalAlign: style.verticalAlign } : {}),
          ...(fixedCanvasChild || measuredGridChild
            ? {
                relativeX: `${parentRect ? rect.left - parentRect.left : 0}px`,
                relativeY: `${parentRect ? rect.top - parentRect.top : 0}px`,
              }
            : {}),
        };
        const flowChildren = visibleFlowChildren(node);
        const verticalFlow = flowDirectionOf(node, style) === 'vertical';
        if (flowChildren.length > 1 && !isInlineFormattingContext(node, style)) {
          const rects = flowChildren.map((child) => child.getBoundingClientRect());
          const gaps = rects
            .slice(1)
            .map((rect, index) =>
              verticalFlow ? rect.top - rects[index]!.bottom : rect.left - rects[index]!.right,
            );
          if (gaps.every((gap) => Number.isFinite(gap) && gap >= 0)) {
            result.inferredGap = `${Math.max(0, Math.min(...gaps))}px`;
            if (Math.max(...gaps) - Math.min(...gaps) > 0.5) {
              report(
                node,
                'non-uniform-spacing',
                'Direct-child spacing is non-uniform; only the minimum gap is projected.',
              );
            }
          }
        }
        if (isTwoDimensionalGrid(node)) {
          result.layoutProjection = 'measured';
          report(
            node,
            'unsupported-grid',
            'Two-dimensional CSS Grid is captured as fixed measured child geometry; responsive grid behavior is unsupported.',
          );
        }
        if (style.boxShadow !== 'none' || style.filter !== 'none') {
          report(
            node,
            'unsupported-effect',
            'CSS shadow/filter is not projected into Figma effects.',
          );
        }
        if (style.transform !== 'none') {
          report(
            node,
            'unsupported-transform',
            'CSS transform is not projected; provide explicit Figma geometry when the transformed result is canonical.',
          );
        }
        if (style.position === 'fixed') {
          report(
            node,
            'unsupported-fixed-position',
            'Fixed viewport positioning has no automatic Figma equivalent; captured geometry is only a static approximation.',
          );
        }
        if (style.zIndex !== 'auto' || style.isolation === 'isolate') {
          report(
            node,
            'unsupported-stacking-context',
            'CSS stacking context/order is not projected into Figma layer order.',
          );
        }
        if (
          style.position === 'absolute' &&
          node instanceof HTMLElement &&
          node.offsetParent &&
          node.offsetParent !== node.parentElement
        ) {
          report(
            node,
            'unsupported-containing-block',
            'Absolute positioning is supported only when the direct parent is the CSS containing block.',
          );
        }
        // Capture motion metadata, but serialize a deterministic canonical
        // static state rather than whichever animated opacity Playwright sampled.
        if (style.animationName !== 'none')
          result.opacity = node.getAttribute('data-design-static-opacity') ?? '1';
        return result;
      };
      const text = (node: Element) => ({
        ...pick(getComputedStyle(node), textProperties),
        cssWidth: typedDimension(node, 'width'),
        cssHeight: typedDimension(node, 'height'),
        widthSizing: axisSizing(node, 'width'),
        heightSizing: axisSizing(node, 'height'),
      });
      const value = (raw: string) => (raw === 'true' ? true : raw === 'false' ? false : raw);
      const propertiesOf = (node: HTMLElement) => {
        const definition = registry.definitions.find(
          (candidate) => candidate.component === node.dataset.designComponent,
        );
        return Object.fromEntries(
          Array.from(node.attributes)
            .filter((attribute) => attribute.name.startsWith('data-design-prop-'))
            .map((attribute) => {
              const name = attribute.name.slice('data-design-prop-'.length);
              const declared = definition?.propertyValues[name]?.find(
                (candidate) => String(candidate) === attribute.value,
              );
              return [name, declared ?? value(attribute.value)];
            }),
        );
      };
      const belongsTo = (node: Element, root: HTMLElement) => {
        let parent = node.parentElement;
        while (parent && parent !== root) {
          if (parent.dataset.designComponent && definitionNames.has(parent.dataset.designComponent))
            return false;
          parent = parent.parentElement;
        }
        return parent === root;
      };
      const resolveBinding = (
        rule: { property: string; values: Record<string, string> } | undefined,
        properties: Record<string, string | number | boolean>,
      ) => rule?.values[String(properties[rule.property])];
      const tokenForUtility = (name: string) =>
        registry.colorTokens.find(
          (token) => token.stableId.toLowerCase() === `color/${name}`.toLowerCase(),
        )?.stableId ??
        registry.colorTokens.find((token) => token.cssVariable === `--color-${name}`)?.stableId;
      const colorProbe = document.createElement('span');
      colorProbe.style.display = 'none';
      document.body.appendChild(colorProbe);
      const normalizedColors = new Map<string, string>();
      const normalizeColor = (value: string) => {
        const cached = normalizedColors.get(value);
        if (cached) return cached;
        colorProbe.style.color = '';
        colorProbe.style.color = value;
        if (!colorProbe.style.color) return undefined;
        const normalized = getComputedStyle(colorProbe).color;
        normalizedColors.set(value, normalized);
        return normalized;
      };
      const colorValueByToken = new Map(
        registry.colorTokens.flatMap((token) => {
          const value = normalizeColor(`var(${token.cssVariable})`);
          return value ? [[token.stableId, value] as const] : [];
        }),
      );
      const tokenMatchesColor = (token: string, color: string) => {
        const tokenValue = colorValueByToken.get(token);
        return Boolean(tokenValue && normalizeColor(color) === tokenValue);
      };
      const borderBindingMatches = (token: string, style: CSSStyleDeclaration) => {
        const edges = ['Top', 'Right', 'Bottom', 'Left'] as const;
        const visibleEdges = edges.filter((edge) => {
          const width = style.getPropertyValue(`border-${edge.toLowerCase()}-width`);
          const borderStyle = style.getPropertyValue(`border-${edge.toLowerCase()}-style`);
          return Number.parseFloat(width) > 0 && borderStyle !== 'none' && borderStyle !== 'hidden';
        });
        return (
          visibleEdges.length > 0 &&
          visibleEdges.every((edge) =>
            tokenMatchesColor(token, style.getPropertyValue(`border-${edge.toLowerCase()}-color`)),
          )
        );
      };
      const semanticBindingsOf = (node: Element) => {
        const element = node as HTMLElement;
        const style = getComputedStyle(element);
        const result: { background?: string; border?: string; content?: string } = {};
        const targets = {
          background: 'bg-',
          border: 'border-',
          content: 'text-',
        } as const;
        for (const [target, prefix] of Object.entries(targets) as [
          keyof typeof targets,
          string,
        ][]) {
          const explicit =
            element.dataset[
              `designToken${target.charAt(0).toUpperCase()}${target.slice(1)}` as keyof DOMStringMap
            ];
          const token =
            explicit ??
            Array.from(element.classList)
              .filter((className) => !className.includes(':') && className.startsWith(prefix))
              .map((className) => className.slice(prefix.length).split('/')[0])
              .filter((name): name is string => Boolean(name))
              .map(tokenForUtility)
              .filter((stableId): stableId is string => Boolean(stableId))
              .at(-1);
          if (!token) continue;
          const matches =
            target === 'background'
              ? tokenMatchesColor(token, style.backgroundColor)
              : target === 'content'
                ? tokenMatchesColor(token, style.color)
                : borderBindingMatches(token, style);
          if (matches) result[target] = token;
        }
        return result;
      };
      const identityOf = (node: Element) => {
        const element = node as HTMLElement;
        const key = element.dataset.designKey;
        const layer = element.dataset.designLayer;
        return key || layer ? { ...(key ? { key } : {}), ...(layer ? { layer } : {}) } : undefined;
      };

      interface BrowserNestedComponent {
        componentRef: string;
        identity?: { key?: string; layer?: string };
        properties: Record<string, string | number | boolean>;
        slots: Record<
          string,
          | string
          | {
              kind: 'slot' | 'container' | 'asset-swap';
              children: BrowserNestedLayer[];
              bindings?: { background?: string; border?: string; content?: string };
            }
        >;
        textSlotStyles?: Record<string, Record<string, string>>;
        style?: Record<string, string>;
        bindings?: { background?: string; border?: string; content?: string };
      }
      interface BrowserNestedElement {
        kind: 'element';
        name: string;
        identity?: { key?: string; layer?: string };
        style: Record<string, string>;
        bindings?: { background?: string; border?: string; content?: string };
        children: BrowserNestedLayer[];
      }
      interface BrowserNestedText {
        kind: 'text';
        text: string;
        identity?: { key?: string; layer?: string };
        style: Record<string, string>;
        bindings?: { background?: string; border?: string; content?: string };
        textStyleRef?: string;
        colorRef?: string;
        runs?: { start: number; end: number; textStyleRef?: string; colorRef?: string }[];
      }
      interface BrowserAsset {
        kind: 'asset';
        assetRef: string;
        identity?: { key?: string; layer?: string };
        style: Record<string, string>;
        colorRef?: string;
      }
      interface BrowserSlotReference {
        kind: 'slot-ref';
        name: string;
      }
      type BrowserNestedLayer =
        | BrowserNestedComponent
        | BrowserNestedElement
        | BrowserNestedText
        | BrowserAsset
        | BrowserSlotReference;

      const textFlowOf = (element: HTMLElement): BrowserNestedText | undefined => {
        if (element.dataset.designTextFlow !== 'true' && !isNativeInlineTextFlow(element))
          return undefined;
        const separator = element.dataset.designTextSeparator;
        const fragments: { text: string; owner: HTMLElement }[] = [];
        const appendText = (raw: string, owner: HTMLElement) => {
          if (raw) fragments.push({ text: raw, owner });
        };
        const visit = (node: Node, owner: HTMLElement) => {
          if (node.nodeType === Node.TEXT_NODE) {
            appendText(node.textContent ?? '', owner);
            return;
          }
          if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) return;
          const child = node as HTMLElement;
          if (isExcludedFromVisualCapture(child)) return;
          if (
            child !== element &&
            (child.dataset.designAssetRef ||
              child.dataset.designSlot ||
              child.dataset.designLayer ||
              definitionNames.has(child.dataset.designComponent ?? ''))
          )
            return;
          const semanticOwner = child.dataset.designTextStyleRef ? child : owner;
          child.childNodes.forEach((nested) => visit(nested, semanticOwner));
        };
        if (separator !== undefined) {
          const children = Array.from(element.children).filter(
            (child): child is HTMLElement =>
              child instanceof HTMLElement && !isExcludedFromVisualCapture(child),
          );
          const visibleChildren = Array.from(element.children).filter(
            (child) => !isExcludedFromVisualCapture(child),
          );
          if (children.length !== visibleChildren.length) return undefined;
          for (const child of children) appendText(child.textContent ?? '', child);
        } else {
          element.childNodes.forEach((node) => visit(node, element));
        }
        if (!fragments.length) return undefined;
        let content = '';
        const runs = fragments.flatMap((child, index) => {
          let normalized = child.text.replace(/\s+/g, ' ');
          if (separator !== undefined) normalized = normalized.trim();
          else {
            if (!content) normalized = normalized.replace(/^ /, '');
            if (content.endsWith(' ') && normalized.startsWith(' '))
              normalized = normalized.slice(1);
          }
          if (index && separator !== undefined) content += separator;
          const start = content.length;
          content += normalized;
          return normalized
            ? [
                {
                  start,
                  end: content.length,
                  textStyleRef: child.owner.dataset.designTextStyleRef,
                  colorRef: semanticBindingsOf(child.owner).content,
                },
              ]
            : [];
        });
        if (separator === undefined && content.endsWith(' ')) {
          content = content.slice(0, -1);
          const lastRun = runs.at(-1);
          if (lastRun) lastRun.end = content.length;
        }
        const semanticRuns = runs.filter(
          (run) => run.end > run.start && (run.textStyleRef ?? run.colorRef),
        );
        return {
          kind: 'text',
          text: content,
          identity: identityOf(element),
          // A semantic text flow still carries local CSS catalog such as
          // uppercase, line-through, alignment, or a one-off metric override.
          // The canonical text style remains linked separately through
          // textStyleRef/runs.
          style: {
            ...box(element),
            ...pick(getComputedStyle(element), textProperties),
          },
          bindings: semanticBindingsOf(element),
          textStyleRef: element.dataset.designTextStyleRef,
          colorRef: semanticBindingsOf(element).content,
          runs: semanticRuns.length ? semanticRuns : undefined,
        };
      };

      const assetOf = (element: HTMLElement): BrowserAsset | undefined => {
        const assetRef = element.dataset.designAssetRef;
        if (!assetRef) return undefined;
        return {
          kind: 'asset',
          assetRef,
          identity: identityOf(element),
          style: box(element),
          colorRef: semanticBindingsOf(element).content,
        };
      };

      const textNodeStyle = (node: Text) => {
        const parent = node.parentElement!;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const parentDefinition = registry.definitions.find(
          (definition) => definition.component === parent.dataset.designComponent,
        );
        const fixedCanvasChild = parentDefinition?.figma?.root?.layoutMode === 'NONE';
        return {
          ...pick(getComputedStyle(parent), textProperties),
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          cssWidth: 'auto',
          cssHeight: 'auto',
          widthSizing: 'hug',
          heightSizing: 'hug',
          ...(fixedCanvasChild
            ? {
                relativeX: `${rect.left - parentRect.left}px`,
                relativeY: `${rect.top - parentRect.top}px`,
              }
            : {}),
          position: 'static',
          top: 'auto',
          right: 'auto',
          bottom: 'auto',
          left: 'auto',
        };
      };

      const hasTextBoxPresentation = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        const numeric = (value: string) => Number.parseFloat(value) || 0;
        const hasPadding =
          numeric(style.paddingTop) > 0 ||
          numeric(style.paddingRight) > 0 ||
          numeric(style.paddingBottom) > 0 ||
          numeric(style.paddingLeft) > 0;
        const hasBorder =
          numeric(style.borderTopWidth) > 0 ||
          numeric(style.borderRightWidth) > 0 ||
          numeric(style.borderBottomWidth) > 0 ||
          numeric(style.borderLeftWidth) > 0;
        const hasBackground = !new Set([
          '',
          'transparent',
          'rgba(0, 0, 0, 0)',
          'rgba(0, 0, 0, 0.0)',
        ]).has(style.backgroundColor.trim().toLowerCase());
        return hasPadding || hasBorder || hasBackground;
      };
      const boxedTextFlowOf = (
        element: HTMLElement,
        textFlow: BrowserNestedLayer,
      ): BrowserNestedLayer => {
        if (!('kind' in textFlow) || textFlow.kind !== 'text') return textFlow;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const numeric = (value: string) => Number.parseFloat(value) || 0;
        const horizontalInsets =
          numeric(style.paddingLeft) +
          numeric(style.paddingRight) +
          numeric(style.borderLeftWidth) +
          numeric(style.borderRightWidth);
        const verticalInsets =
          numeric(style.paddingTop) +
          numeric(style.paddingBottom) +
          numeric(style.borderTopWidth) +
          numeric(style.borderBottomWidth);
        const textStyle = {
          ...textFlow.style,
          width: `${Math.max(rect.width - horizontalInsets, 0)}px`,
          height: `${Math.max(rect.height - verticalInsets, 0)}px`,
          cssWidth: 'auto',
          cssHeight: 'auto',
          paddingTop: '0px',
          paddingRight: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          borderTopWidth: '0px',
          borderRightWidth: '0px',
          borderBottomWidth: '0px',
          borderLeftWidth: '0px',
          backgroundColor: 'rgba(0, 0, 0, 0)',
          widthSizing: textFlow.style.widthSizing === 'fixed' ? 'fixed' : 'fill',
          heightSizing: 'hug',
        };
        return {
          kind: 'element',
          name:
            element.dataset.designLayer ??
            element.getAttribute('aria-label') ??
            element.tagName.toLowerCase(),
          identity: identityOf(element),
          style: box(element),
          bindings: semanticBindingsOf(element),
          children: [{ ...textFlow, identity: undefined, style: textStyle }],
        };
      };
      const nestedLayersOf = (
        container: HTMLElement,
        slotOwner?: { root: HTMLElement; names: ReadonlySet<string> },
      ): BrowserNestedLayer[] =>
        Array.from(container.childNodes).flatMap((node): BrowserNestedLayer[] => {
          if (node.nodeType === Node.TEXT_NODE) {
            const content = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            return content
              ? [
                  {
                    kind: 'text',
                    text: content,
                    identity: identityOf((node as Text).parentElement!),
                    style: textNodeStyle(node as Text),
                    bindings: semanticBindingsOf((node as Text).parentElement!),
                  },
                ]
              : [];
          }
          if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) return [];
          const element = node as HTMLElement;
          if (isExcludedFromVisualCapture(element)) return [];
          const slotName = element.dataset.designSlot;
          if (slotName && slotOwner?.names.has(slotName) && belongsTo(element, slotOwner.root)) {
            return [{ kind: 'slot-ref', name: slotName }];
          }
          if (getComputedStyle(element).display === 'contents') {
            return nestedLayersOf(element, slotOwner);
          }
          const asset = assetOf(element);
          if (asset) return [asset];
          const textFlow = textFlowOf(element);
          if (textFlow)
            return [
              hasTextBoxPresentation(element) ? boxedTextFlowOf(element, textFlow) : textFlow,
            ];
          if (definitionNames.has(element.dataset.designComponent ?? '')) {
            return [nestedComponentOf(element)];
          }
          let children = nestedLayersOf(element, slotOwner);
          if (
            !children.length &&
            (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
          ) {
            const content = element.value || element.placeholder;
            if (content) children = [{ kind: 'text', text: content, style: text(element) }];
          }
          return [
            {
              kind: 'element',
              name:
                element.dataset.designLayer ??
                element.getAttribute('aria-label') ??
                element.tagName.toLowerCase(),
              identity: identityOf(element),
              style: box(element),
              bindings: semanticBindingsOf(element),
              children,
            },
          ];
        });

      function nestedComponentOf(child: HTMLElement): BrowserNestedComponent {
        const componentRef = child.dataset.designComponent!;
        const childDefinition = registry.definitions.find(
          (candidate) => candidate.component === componentRef,
        );
        const childSlots: BrowserNestedComponent['slots'] = {};
        const textSlotStyles: NonNullable<BrowserNestedComponent['textSlotStyles']> = {};
        for (const [childSlotName, childSlot] of Object.entries(childDefinition?.slots ?? {})) {
          const childSlotNode = Array.from(
            child.querySelectorAll<HTMLElement>(`[data-design-slot="${childSlotName}"]`),
          ).find((candidate) => belongsTo(candidate, child));
          if (!childSlotNode) continue;
          if (childSlot.kind === 'text') {
            childSlots[childSlotName] = childSlotNode.textContent?.trim() ?? '';
            // The host component's computed font is not necessarily the font of
            // its public label. Capture the
            // actual rendered slot node so contextual typography is projected
            // without inflating every nested component label.
            textSlotStyles[childSlotName] = text(childSlotNode);
            continue;
          }
          if (childSlot.kind === 'asset-swap') {
            const assetNode = childSlotNode.dataset.designAssetRef
              ? childSlotNode
              : childSlotNode.querySelector<HTMLElement>('[data-design-asset-ref]');
            const asset = assetNode && assetOf(assetNode);
            if (asset) {
              childSlots[childSlotName] = {
                kind: 'asset-swap',
                children: [asset],
                bindings: {
                  ...semanticBindingsOf(childSlotNode),
                  content: asset.colorRef,
                },
              };
            }
            continue;
          }
          if (childSlot.kind === 'slot' || childSlot.kind === 'container') {
            const richText = textFlowOf(childSlotNode);
            childSlots[childSlotName] = {
              kind: childSlot.kind,
              // A control may own the public slot on the same DOM node (Field
              // + TextArea is the common case). Preserve the component
              // instance before considering native input text projection;
              // otherwise the editable Figma screen degrades the control to a
              // plain text layer.
              children: definitionNames.has(childSlotNode.dataset.designComponent ?? '')
                ? [nestedComponentOf(childSlotNode)]
                : richText
                  ? [richText]
                  : nestedLayersOf(childSlotNode),
              bindings: semanticBindingsOf(childSlotNode),
            };
          }
        }
        return {
          componentRef,
          identity: identityOf(child),
          properties: propertiesOf(child),
          slots: childSlots,
          textSlotStyles: Object.keys(textSlotStyles).length ? textSlotStyles : undefined,
          style: {
            ...box(child),
          },
          bindings: semanticBindingsOf(child),
        };
      }

      const componentHostedSlotProjectionOf = (slot: HTMLElement) => {
        if (!definitionNames.has(slot.dataset.designComponent ?? '')) return undefined;
        const style = box(slot);
        // The runtime component and the public slot may intentionally share one
        // DOM host. Figma still needs a physical slot wrapper, so the wrapper
        // retains measured geometry while the nested component owns visuals.
        Object.assign(style, {
          paddingTop: '0px',
          paddingRight: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          gap: '0px',
          rowGap: '0px',
          columnGap: '0px',
          backgroundColor: 'rgba(0, 0, 0, 0)',
          backgroundImage: 'none',
          borderTopWidth: '0px',
          borderRightWidth: '0px',
          borderBottomWidth: '0px',
          borderLeftWidth: '0px',
          borderTopStyle: 'none',
          borderRightStyle: 'none',
          borderBottomStyle: 'none',
          borderLeftStyle: 'none',
          borderRadius: '0px',
          borderTopLeftRadius: '0px',
          borderTopRightRadius: '0px',
          borderBottomRightRadius: '0px',
          borderBottomLeftRadius: '0px',
          outlineWidth: '0px',
          outlineStyle: 'none',
          opacity: '1',
        });
        return {
          style,
          children: [nestedComponentOf(slot)],
          bindings: {},
        };
      };

      const colors = registry.colorTokens.map((token) => {
        const value = colorValueByToken.get(token.stableId);
        if (!value)
          throw new Error(`Could not resolve ${token.stableId} from ${token.cssVariable}`);
        return { stableId: token.stableId, name: token.name, value };
      });

      const textStyles = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-design-text-style-capture][data-design-text-style-ref]',
        ),
      ).map((node) => {
        const computed = getComputedStyle(node);
        return {
          kind: 'text-style' as const,
          stableId: node.dataset.designTextStyleRef!,
          name: node.dataset.designResourceName!,
          style: {
            fontFamily: computed.fontFamily,
            fontSize: computed.fontSize,
            fontWeight: computed.fontWeight,
            lineHeight: computed.lineHeight,
            letterSpacing: computed.letterSpacing,
            textTransform: computed.textTransform,
          },
        };
      });

      const assets = Array.from(
        document.querySelectorAll<HTMLElement>('[data-design-asset-capture]'),
      ).map((capture) => {
        const svg = capture.querySelector<SVGSVGElement>('svg[data-design-asset-ref]');
        if (!svg) throw new Error('Asset capture is missing its SVG source');
        const style = getComputedStyle(svg);
        const rect = svg.getBoundingClientRect();
        const serialized = svg.cloneNode(true) as SVGSVGElement;
        const sourceNodes = [svg, ...svg.querySelectorAll<SVGElement>('*')];
        const serializedNodes = [serialized, ...serialized.querySelectorAll<SVGElement>('*')];
        for (const [index, sourceNode] of sourceNodes.entries()) {
          const serializedNode = serializedNodes[index];
          if (!serializedNode) continue;
          // Figma's SVG parser has no access to the page's CSS variables. Resolve
          // authored presentation attributes while they are still in the DOM;
          // this is generic for any semantic-token-driven SVG asset.
          for (const property of ['color', 'fill', 'stroke', 'stop-color'] as const) {
            const authored = serializedNode.getAttribute(property);
            if (!authored?.includes('var(')) continue;
            const resolved = getComputedStyle(sourceNode).getPropertyValue(property).trim();
            if (resolved) serializedNode.setAttribute(property, resolved);
          }
        }
        for (const node of [serialized, ...serialized.querySelectorAll('*')]) {
          for (const attribute of [...node.attributes]) {
            if (attribute.name.startsWith('data-design-')) node.removeAttribute(attribute.name);
          }
        }
        serialized.removeAttribute('class');
        serialized.setAttribute('width', String(rect.width));
        serialized.setAttribute('height', String(rect.height));
        const renderedSvg = serialized.outerHTML.replaceAll('currentColor', style.color);
        const representation = svg.dataset.designAssetRepresentation;
        if (representation !== 'svg' && representation !== 'svg-mask') {
          throw new Error(`Asset ${svg.dataset.designAssetRef} has no supported representation`);
        }
        return {
          kind: 'asset' as const,
          stableId: svg.dataset.designAssetRef!,
          svg: renderedSvg,
          representation,
          style: {
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            opacity: style.opacity,
            color: style.color,
          },
        };
      });

      const components: Record<string, ComponentCaptureIR[]> = {};
      for (const definition of registry.definitions) {
        const roots = Array.from(
          document.querySelectorAll<HTMLElement>(
            `[data-design-capture="true"][data-design-component="${definition.component}"]`,
          ),
        );
        components[definition.component] = roots.map((root) => {
          const properties = propertiesOf(root);
          const declaredSlotNames = new Set(Object.keys(definition.slots));
          const slots = Object.fromEntries(
            Object.entries(definition.slots).map(([slotName, slotSpec]) => {
              const slotCandidates = Array.from(
                root.querySelectorAll<HTMLElement>(`[data-design-slot="${slotName}"]`),
              );
              const slot =
                definition.target === 'screen'
                  ? slotCandidates[0]
                  : slotCandidates.find((candidate) => belongsTo(candidate, root));
              if (!slot) {
                if (slotSpec.required)
                  throw new Error(`${definition.component} is missing required slot ${slotName}`);
                return [slotName, undefined];
              }
              if (slotSpec.kind === 'text') {
                return [
                  slotName,
                  {
                    kind: 'text',
                    text: slot.textContent?.trim() ?? '',
                    textStyleRef: slot.dataset.designTextStyleRef,
                    colorRef: semanticBindingsOf(slot).content,
                    style: text(slot),
                    bindings: semanticBindingsOf(slot),
                  },
                ];
              }
              if (slotSpec.kind === 'asset-swap') {
                const assetNode = slot.dataset.designAssetRef
                  ? slot
                  : slot.querySelector<HTMLElement>('[data-design-asset-ref]');
                const asset = assetNode && assetOf(assetNode);
                return [
                  slotName,
                  asset
                    ? {
                        kind: 'asset-swap',
                        asset,
                        style: box(slot),
                        bindings: {
                          ...semanticBindingsOf(slot),
                          content: asset.colorRef,
                        },
                      }
                    : undefined,
                ];
              }
              const componentHostedSlot = componentHostedSlotProjectionOf(slot);
              if (componentHostedSlot)
                return [slotName, { kind: slotSpec.kind, ...componentHostedSlot }];
              const slotStyle = box(slot);
              const richText = textFlowOf(slot);
              return [
                slotName,
                {
                  kind: slotSpec.kind,
                  style: slotStyle,
                  children: richText
                    ? [richText]
                    : nestedLayersOf(slot, { root, names: declaredSlotNames }),
                  bindings: semanticBindingsOf(slot),
                },
              ];
            }),
          ) as ComponentCaptureIR['slots'];
          const stableValues = definition.variantProperties.map((name) => String(properties[name]));
          return {
            stableId: `${definition.component}/${stableValues.join('/')}`,
            sourceId: root.dataset.designSourceId ?? stableValues.join('-'),
            canonical: root.dataset.designCanonical === 'true' || undefined,
            component: definition.component,
            properties,
            root: box(root),
            bindings: (() => {
              const semantic = semanticBindingsOf(root);
              return {
                background:
                  resolveBinding(definition.bindings?.background, properties) ??
                  semantic.background,
                border: resolveBinding(definition.bindings?.border, properties) ?? semantic.border,
                content:
                  resolveBinding(definition.bindings?.content, properties) ?? semantic.content,
              };
            })(),
            slots,
            structure: nestedLayersOf(root, {
              root,
              names: new Set(Object.keys(definition.slots)),
            }),
          };
        });
      }

      colorProbe.remove();
      return {
        kind: 'design-system' as const,
        schemaVersion: 4 as const,
        generatedAt: new Date().toISOString(),
        source: {
          name: projectSource.name,
          reference: projectSource.reference,
          route: new URL(projectSource.route, location.origin).href,
          viewport: {
            width: innerWidth,
            height: innerHeight,
            deviceScaleFactor: window.devicePixelRatio,
          },
        },
        semantics: {
          componentIdentityAttribute: 'data-design-component' as const,
          slotAttribute: 'data-design-slot' as const,
          note: 'Specs define meaning; Tailwind and the rendered browser provide resolved visual values.',
        },
        definitions: registry.definitions,
        resources: { colors, textStyles, assets },
        diagnostics,
        components,
      } as DesignSystemIR;
    }, projectSource);
    const diagnostics = [
      ...(captured.diagnostics ?? []),
      ...collectCssProjectionDiagnostics(captured.components, captured.resources),
    ];
    stripDiagnosticOnlyStyleProperties(captured.components, captured.resources);
    return {
      ...captured,
      diagnostics: diagnostics.filter(
        (diagnostic, index) =>
          diagnostics.findIndex(
            (candidate) =>
              candidate.code === diagnostic.code &&
              candidate.component === diagnostic.component &&
              candidate.layer === diagnostic.layer &&
              candidate.message === diagnostic.message,
          ) === index,
      ),
    };
  } finally {
    await browser.close();
  }
}

let vite: ChildProcess | undefined;
try {
  if (!process.env.NEVO_CAPTURE_URL) vite = startVite();
  await waitForServer(baseUrl);
  const captured = await extract();
  const designDefinitions = captured.definitions.filter(
    (definition) => !definition.target || definition.target === 'component',
  );
  const screenContentDefinitions = captured.definitions.filter(
    (definition) => definition.target === 'fragment' || definition.target === 'screen',
  );
  const designIR: DesignSystemIR = {
    ...captured,
    definitions: designDefinitions,
    diagnostics: captured.diagnostics?.filter((diagnostic) =>
      designDefinitions.some((definition) => definition.component === diagnostic.component),
    ),
    components: Object.fromEntries(
      designDefinitions.map((definition) => [
        definition.component,
        captured.components[definition.component] ?? [],
      ]),
    ),
  };
  const screensIR: ScreensIR = {
    kind: 'screens',
    schemaVersion: 3,
    generatedAt: captured.generatedAt,
    source: captured.source,
    semantics: captured.semantics,
    // Screens carry read-only component contracts so nested componentRefs can be
    // resolved, but only target=screen definitions are synchronized by this file.
    definitions: captured.definitions,
    resources: captured.resources,
    diagnostics: captured.diagnostics?.filter((diagnostic) =>
      screenContentDefinitions.some((definition) => definition.component === diagnostic.component),
    ),
    screens: Object.fromEntries(
      screenContentDefinitions.map((definition) => [
        definition.component,
        captured.components[definition.component] ?? [],
      ]),
    ),
  };
  validateIR(designIR);
  validateIR(screensIR);
  await Promise.all([
    mkdir(path.dirname(designOutputPath), { recursive: true }),
    mkdir(path.dirname(screensOutputPath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(designOutputPath, `${JSON.stringify(designIR, null, 2)}\n`, 'utf8'),
    writeFile(screensOutputPath, `${JSON.stringify(screensIR, null, 2)}\n`, 'utf8'),
  ]);
  const componentCount = Object.values(designIR.components).reduce(
    (sum, captures) => sum + captures.length,
    0,
  );
  const screenCount = Object.values(screensIR.screens).reduce(
    (sum, captures) => sum + captures.length,
    0,
  );
  console.log(
    `Wrote ${designIR.resources.textStyles.length} text styles, ${designIR.resources.assets.length} assets and ${componentCount} component captures to ${designOutputPath}`,
  );
  console.log(`Wrote ${screenCount} fragment/screen captures to ${screensOutputPath}`);
} finally {
  vite?.kill();
}
