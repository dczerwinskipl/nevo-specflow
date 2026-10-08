export interface Event {
  id: string;
  label: string;
}
export interface Todo {
  id: string;
  title: string;
  updatedAt: string;
  history: Event[];
}
export interface User {
  id: string;
  name: string;
  updatedAt: string;
}
export interface Item {
  id: string;
  label: string;
  updatedAt: string;
}
export interface DemoSnapshot {
  revision: number;
  todos: Todo[];
  users: User[];
  items: Item[];
}

export function createDemoStore() {
  let snapshot: DemoSnapshot = {
    revision: 1,
    todos: [
      {
        id: 't1',
        title: 'Review navigation',
        updatedAt: 'revision 1',
        history: [
          { id: 'e1', label: 'Created' },
          { id: 'e2', label: 'Reviewed' },
        ],
      },
      {
        id: 't2',
        title: 'Write tests',
        updatedAt: 'revision 1',
        history: [{ id: 'e3', label: 'Assigned' }],
      },
      { id: 't3', title: 'Ship release', updatedAt: 'revision 1', history: [] },
    ],
    users: [
      { id: 'u1', name: 'Anna', updatedAt: 'revision 1' },
      { id: 'u2', name: 'Marek', updatedAt: 'revision 1' },
    ],
    items: [
      { id: 'i1', label: 'Laptop', updatedAt: 'revision 1' },
      { id: 'i2', label: 'Monitor', updatedAt: 'revision 1' },
    ],
  };
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    refresh: () => {
      const revision = snapshot.revision + 1;
      snapshot = {
        revision,
        todos: snapshot.todos.map((todo) => ({
          ...todo,
          updatedAt: `revision ${revision}`,
          history: todo.history.map((event) => ({
            ...event,
            label: `${event.id} updated at revision ${revision}`,
          })),
        })),
        users: snapshot.users.map((user) => ({ ...user, updatedAt: `revision ${revision}` })),
        items: snapshot.items.map((item) => ({ ...item, updatedAt: `revision ${revision}` })),
      };
      notify();
    },
    removeTodo: (id: string) => {
      snapshot = { ...snapshot, todos: snapshot.todos.filter((todo) => todo.id !== id) };
      notify();
    },
    removeEvent: (todoId: string, eventId: string) => {
      snapshot = {
        ...snapshot,
        todos: snapshot.todos.map((todo) =>
          todo.id === todoId
            ? { ...todo, history: todo.history.filter((event) => event.id !== eventId) }
            : todo,
        ),
      };
      notify();
    },
  };
}
export type DemoStore = ReturnType<typeof createDemoStore>;
