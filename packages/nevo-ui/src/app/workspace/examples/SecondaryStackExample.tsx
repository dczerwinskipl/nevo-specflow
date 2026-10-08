import { useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  AppContent,
  AppWorkspace,
  AppWorkspaceProvider,
  Button,
  WorkspaceHeader,
  defineSecondaryStack,
  useSecondaryNavigation,
  useSecondaryStack,
  type SecondaryData,
  type SecondaryScreenProps,
} from '../../index';
import { AppShell } from '../shell/AppShell';

interface Event { id: string; label: string }
interface Todo { id: string; title: string; updatedAt: string; history: Event[] }
interface User { id: string; name: string; updatedAt: string }
interface Item { id: string; label: string; updatedAt: string }
interface DemoSnapshot { revision: number; todos: Todo[]; users: User[]; items: Item[] }

function createDemoStore() {
  let snapshot: DemoSnapshot = {
    revision: 1,
    todos: [
      { id: 't1', title: 'Review navigation', updatedAt: 'revision 1', history: [{ id: 'e1', label: 'Created' }, { id: 'e2', label: 'Reviewed' }] },
      { id: 't2', title: 'Write tests', updatedAt: 'revision 1', history: [{ id: 'e3', label: 'Assigned' }] },
      { id: 't3', title: 'Ship release', updatedAt: 'revision 1', history: [] },
    ],
    users: [{ id: 'u1', name: 'Anna', updatedAt: 'revision 1' }, { id: 'u2', name: 'Marek', updatedAt: 'revision 1' }],
    items: [{ id: 'i1', label: 'Laptop', updatedAt: 'revision 1' }, { id: 'i2', label: 'Monitor', updatedAt: 'revision 1' }],
  };
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    refresh: () => {
      const revision = snapshot.revision + 1;
      snapshot = {
        revision,
        todos: snapshot.todos.map(todo => ({
          ...todo,
          updatedAt: `revision ${revision}`,
          history: todo.history.map(event => ({ ...event, label: `${event.id} updated at revision ${revision}` })),
        })),
        users: snapshot.users.map(user => ({ ...user, updatedAt: `revision ${revision}` })),
        items: snapshot.items.map(item => ({ ...item, updatedAt: `revision ${revision}` })),
      };
      notify();
    },
    removeTodo: (id: string) => {
      snapshot = { ...snapshot, todos: snapshot.todos.filter(todo => todo.id !== id) };
      notify();
    },
    removeEvent: (todoId: string, eventId: string) => {
      snapshot = {
        ...snapshot,
        todos: snapshot.todos.map(todo => todo.id === todoId
          ? { ...todo, history: todo.history.filter(event => event.id !== eventId) }
          : todo),
      };
      notify();
    },
  };
}
type DemoStore = ReturnType<typeof createDemoStore>;
type TodoPages = { details: Record<never, never>; history: Record<never, never>; event: { eventId: string } };
type UserPages = { details: Record<never, never> };
type ItemPages = { details: Record<never, never> };
let mountSequence = 0;

function Mounted({ children }: { children: ReactNode }) {
  const [instance] = useState(() => ++mountSequence);
  return <div data-screen-mount={instance}>{children}<small>Mount #{instance}</small></div>;
}

function TodoDetails({ data: todo }: SecondaryScreenProps<Todo, TodoPages['details']>) {
  const nav = useSecondaryStack<TodoPages>();
  return <Mounted><div className="grid gap-3 p-4">
    <strong>{todo.title}</strong>
    <output data-updated-at>{todo.updatedAt}</output>
    <Button onClick={() => void nav.navTo('history')}>Todo history</Button>
  </div></Mounted>;
}
function TodoHistory({ data: todo }: SecondaryScreenProps<Todo, TodoPages['history']>) {
  const nav = useSecondaryStack<TodoPages>();
  return <Mounted><div className="grid gap-3 p-4">
    <strong>{todo.title} history</strong>
    <output data-updated-at>{todo.updatedAt}</output>
    {todo.history.map(event => <Button key={event.id} onClick={() => void nav.navTo('event', { eventId: event.id })}>
      Open {event.id}
    </Button>)}
  </div></Mounted>;
}
function TodoEvent({ data: todo, params }: SecondaryScreenProps<Todo, TodoPages['event']>) {
  const event = todo.history.find(item => item.id === params.eventId);
  return <Mounted><div className="grid gap-3 p-4">
    <strong>{todo.title} event</strong>
    <output data-updated-at>{todo.updatedAt}</output>
    {event ? <p>{event.label}</p> : <p role="status">This history entry is no longer available.</p>}
  </div></Mounted>;
}
function UserDetails({ data: user }: SecondaryScreenProps<User, UserPages['details']>) {
  return <Mounted><div className="grid gap-3 p-4"><strong>{user.name}</strong><output data-updated-at>{user.updatedAt}</output></div></Mounted>;
}
function ItemDetails({ data: item }: SecondaryScreenProps<Item, ItemPages['details']>) {
  return <Mounted><div className="grid gap-3 p-4"><strong>{item.label}</strong><output data-updated-at>{item.updatedAt}</output></div></Mounted>;
}

/** Pages are registered independently of Primary, and the data hook lives in the stack host. */
function createDemoStacks(store: DemoStore) {
  function useTodoData({ id }: { id: string }): SecondaryData<Todo> {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const todo = snapshot.todos.find(value => value.id === id);
    return todo ? { status: 'ready', data: todo } : { status: 'unavailable', message: 'Todo no longer available.' };
  }
  function useUserData({ id }: { id: string }): SecondaryData<User> {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const user = snapshot.users.find(value => value.id === id);
    return user ? { status: 'ready', data: user } : { status: 'unavailable' };
  }
  function useItemData({ id }: { id: string }): SecondaryData<Item> {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const item = snapshot.items.find(value => value.id === id);
    return item ? { status: 'ready', data: item } : { status: 'unavailable' };
  }
  return {
    todo: defineSecondaryStack<{ id: string }, Todo, TodoPages>({
      id: 'demo-todo', initial: 'details', useData: useTodoData,
      screens: {
        details: { title: 'Todo details', component: TodoDetails },
        history: { title: 'Todo history', component: TodoHistory },
        event: { title: 'Todo event', component: TodoEvent },
      },
    }),
    user: defineSecondaryStack<{ id: string }, User, UserPages>({
      id: 'demo-user', initial: 'details', useData: useUserData,
      screens: { details: { title: 'User details', component: UserDetails } },
    }),
    item: defineSecondaryStack<{ id: string }, Item, ItemPages>({
      id: 'demo-item', initial: 'details', useData: useItemData,
      screens: { details: { title: 'Item details', component: ItemDetails } },
    }),
  };
}
type DemoStacks = ReturnType<typeof createDemoStacks>;

function EntityLists({ store, stacks }: { store: DemoStore; stacks: DemoStacks }) {
  const navigation = useSecondaryNavigation();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return <div className="grid gap-5 p-5">
    <div className="flex flex-wrap gap-2">
      <Button onClick={store.refresh}>Refresh data</Button>
      <Button variant="secondary" onClick={() => store.removeTodo('t1')}>Remove Todo t1</Button>
      <Button variant="secondary" onClick={() => store.removeEvent('t1', 'e1')}>Remove Event e1</Button>
      <span data-revision>Snapshot {snapshot.revision}</span>
    </div>
    <section><h2>Todos</h2><div className="flex flex-wrap gap-2">
      {snapshot.todos.map(todo => <Button key={todo.id} variant="secondary" onClick={() => void navigation.open(stacks.todo, { id: todo.id })}>{todo.title}</Button>)}
    </div></section>
    <section><h2>Users</h2><div className="flex flex-wrap gap-2">
      {snapshot.users.map(user => <Button key={user.id} variant="secondary" onClick={() => void navigation.open(stacks.user, { id: user.id })}>{user.name}</Button>)}
    </div></section>
    <section><h2>Items</h2><div className="flex flex-wrap gap-2">
      {snapshot.items.map(item => <Button key={item.id} variant="secondary" onClick={() => void navigation.open(stacks.item, { id: item.id })}>{item.label}</Button>)}
    </div></section>
  </div>;
}

function DemoWorkspace({ store, stacks }: { store: DemoStore; stacks: DemoStacks }) {
  return <AppWorkspace split="primary">
    <AppWorkspace.Primary header={<WorkspaceHeader title="Secondary stack demo" />}>
      <AppContent><EntityLists store={store} stacks={stacks} /></AppContent>
    </AppWorkspace.Primary>
    <AppWorkspace.Secondary header={<WorkspaceHeader title="Activity" />}>
      <div className="p-4">Default Secondary. Opening a Todo, User or Item replaces the entire contextual stack.</div>
    </AppWorkspace.Secondary>
  </AppWorkspace>;
}

export function SecondaryStackExample({ width = 1400 }: { width?: number }) {
  const [store] = useState(createDemoStore);
  const [stacks] = useState(() => createDemoStacks(store));
  return <div style={{ width, maxWidth: '100%', height: 700 }}>
    <AppWorkspaceProvider>
      <AppShell navigation={<div className="p-5">Demo navigation</div>} style={{ height: '100%', width: '100%' }}>
        <DemoWorkspace store={store} stacks={stacks} />
      </AppShell>
    </AppWorkspaceProvider>
  </div>;
}
