import type { TabAction, TabContent, TabContentProvider } from '../tab-host/types.stories-support';
import {
  contentRegistry,
  effectiveView,
  wrapFor,
  type ContentAction,
  type MockLayout,
} from './contentKinds.stories-support';
import { documentById, fileName } from './fixtures.stories-support';
import type { EditorSession } from './useEditorSession.stories-support';

/** Direct (icon) actions that fit the header: Wide 2, Compact 1, Narrow 1. */
export const headerBudget = (layout: MockLayout) => (layout === 'wide' ? 2 : 1);

/**
 * ContentAction[] -> the host's TabAction[]. Promoted actions (lowest number first, up to the
 * budget) become header icons and ALSO stay in the menu under the same id and label (the host adds
 * the primary Save to the menu itself, so it is not duplicated here). Everything else is menu-only.
 */
function toHostActions(actions: ContentAction[], budget: number): TabAction[] {
  const promoted = actions
    .filter((action) => action.promoted !== undefined)
    .sort((a, b) => a.promoted! - b.promoted!)
    .slice(0, budget);
  const base = (action: ContentAction): TabAction =>
    ({
      id: action.id,
      label: action.label,
      icon: action.icon,
      tone: action.tone,
      disabled: action.disabled,
      shortcut: action.shortcut,
      checked: action.checked,
      primary: action.primary,
      group: action.group === 'display' ? 'display' : undefined,
      presentation: 'icon',
      direct: 'never',
      onPress: action.onPress,
    }) as TabAction;
  const icons = promoted.map((action) => ({ ...base(action), direct: 'always' as const }));
  const menu = actions.filter((action) => !(action.primary && promoted.includes(action))).map(base);
  return [...icons, ...menu];
}

/**
 * The editor's side of the contract: turns an item id into what the tab host needs (label, dirty,
 * render, actions, settle). Everything editor-specific (views, wrap, gutter, split) stays behind it.
 */
export function editorProvider(
  session: EditorSession,
  env: { layout: MockLayout; splitAvailable: boolean },
): TabContentProvider {
  const narrow = env.layout === 'narrow';
  return (id: string): TabContent => {
    const doc = documentById(id);
    const descriptor = contentRegistry[doc.kind];
    const view = effectiveView(session, doc, env.splitAvailable);
    const dirty = session.isDirty(id);
    return {
      label: fileName(doc.path),
      path: doc.path,
      dirty,
      state: doc.state,
      render: () => (
        <descriptor.Renderer
          doc={doc}
          files={session}
          view={view}
          narrow={narrow}
          wrap={wrapFor(session, doc, narrow)}
          lineNumbers={session.lineNumbers}
        />
      ),
      actions: () =>
        toHostActions(
          descriptor.actions(view, {
            files: session,
            doc,
            layout: env.layout,
            splitAvailable: env.splitAvailable,
            wrap: wrapFor(session, doc, narrow),
            lineNumbers: session.lineNumbers,
            dirty,
          }),
          headerBudget(env.layout),
        ),
      settle: (action) => (action === 'save' ? session.save(id) : session.discard(id)),
    };
  };
}
