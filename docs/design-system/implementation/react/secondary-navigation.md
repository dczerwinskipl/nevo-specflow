---
id: design-system.implementation.react.secondary-navigation
type: architecture
title: Secondary navigation
status: current
read_when:
  - adding a contextual Secondary inspector to a workspace
  - navigating between nested inspector screens
  - debugging data refreshes, remounts or default Secondary behavior
summary: >
  Product-neutral in-memory Secondary screen catalogues and lifecycle, distinct from route navigation.
related:
  - design-system.principles.system-boundary
  - product.specflow.ui.interaction-model
---

# Secondary navigation

Secondary navigation is an ephemeral in-memory **single active flow**. It is not an application router.
Product routes remain owned by the application router. This is not the global navigation Drawer.

## Ownership

- `AppWorkspace.Primary` renders the main work surface.
- `AppWorkspace.Secondary` is the optional declarative base shown on split-capable layouts.
- A runtime Secondary flow temporarily takes precedence over the declarative base.
- `AppWorkspaceProvider` owns one active flow and its array of page descriptors.
- Feature code defines available pages in `defineSecondaryStack`, usually in a separate module.
- A page descriptor contains a page name, small page-specific identifiers and an instance key. Do not store React elements or cached domain snapshots in navigation state.
- `useData(rootParams)` resolves current data in a stable host. A refresh updates rendered props without a navigation transition.

## Consumer API

```tsx
type TodoPages = {
  details: Record<never, never>;
  history: Record<never, never>;
  event: { eventId: string };
};

const todoStack = defineSecondaryStack<{ id: string }, Todo, TodoPages>({
  id: 'todo',
  initial: 'details',
  useData: ({ id }) => useTodoSidebarData(id),
  screens: {
    details: { title: 'Todo', component: TodoDetails },
    history: { title: 'History', component: TodoHistory },
    event: { title: 'Event', component: TodoEvent },
  },
});

// In a Primary list or any descendant of AppWorkspaceProvider:
const navigation = useSecondaryNavigation();
void navigation.open(todoStack, { id: todo.id });

// Inside a registered Todo screen:
const stack = useSecondaryStack<TodoPages>();
void stack.navTo('history');
void stack.navTo('event', { eventId });
void stack.back();
void stack.close();
```

`open` always discards the prior flow and starts from its registered initial page.
`navTo` pushes a page within the active flow; `replace` changes only the top page.
`back` pops a page, and on the root closes the runtime flow.
`close` clears the runtime flow. Asynchronous callbacks from disposed screens cannot operate
on a newer flow.

`useSecondaryLeaveGuard` optionally registers a guard for the active page. Navigation checks
the guard before replacing, popping or closing that page; denied transitions leave the state intact.
Avoid synchronizing two owners of the Secondary with effects in product screens.

## Refresh and missing data

The screen host always invokes the stack's `useData` hook while active.
Its discriminated result is one of `loading`, `ready`, `unavailable` or `error`.
No result automatically navigates away. Ordinary refetches should retain a `ready` result when
the previous usable data remains available, then update the `data` prop.

Keep IDs in root/page navigation params. Resolve nested events/files against **current** data in
the owning screen; their absence should show an unavailable state, not stale snapshots.
An entity missing from a filtered list is not necessarily deleted from its authoritative source.

The identity of the active React page is independent of refreshed data. A new page navigation
may remount screens; an ordinary data update must not.

## Presentation

AppWorkspace owns the responsive split/stacked choice and automatic header controls.
On Narrow, the active runtime Secondary replaces visible Primary and Back occupies the navigation
position instead of the global hamburger. On desktop/split, Back and Close are provided by the
workspace header. Default Secondary is not part of the runtime page stack.

Browser history/Back interception and serialization of transient pages are **out of scope**.

## Verification

The canonical Storybook examples at
`packages/nevo-ui/src/app/workspace/examples/SecondaryStackExample.stories.tsx`
exercise deep Todo navigation, switching to User, refreshing data without remounts,
unavailable nested events/root entities and mobile Back. The CRM example provides an independent
consumer. Keep every legacy runtime-node navigation API removed from code, tests and exports.
