import { useSyncExternalStore } from 'react';
import { defineSecondaryStack, type SecondaryData } from '../../index';
import type { DemoStore, Todo, User, Item } from './DemoStore';
import {
  TodoDetails,
  TodoHistory,
  TodoEvent,
  UserDetails,
  ItemDetails,
  type TodoPages,
  type UserPages,
  type ItemPages,
} from './SidebarScreens';

/** Pages are registered independently of Primary, and the data hook lives in the stack host. */
export function createDemoStacks(store: DemoStore) {
  function useTodoData({ id }: { id: string }): SecondaryData<Todo> {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    const todo = snapshot.todos.find((value) => value.id === id);
    return todo
      ? { status: 'ready', data: todo }
      : { status: 'unavailable', message: 'Todo no longer available.' };
  }
  function useUserData({ id }: { id: string }): SecondaryData<User> {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    const user = snapshot.users.find((value) => value.id === id);
    return user ? { status: 'ready', data: user } : { status: 'unavailable' };
  }
  function useItemData({ id }: { id: string }): SecondaryData<Item> {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    const item = snapshot.items.find((value) => value.id === id);
    return item ? { status: 'ready', data: item } : { status: 'unavailable' };
  }
  return {
    todo: defineSecondaryStack<{ id: string }, Todo, TodoPages>({
      id: 'demo-todo',
      initial: 'details',
      useData: useTodoData,
      screens: {
        details: { title: 'Todo details', component: TodoDetails },
        history: { title: 'Todo history', component: TodoHistory },
        event: { title: 'Todo event', component: TodoEvent },
      },
    }),
    user: defineSecondaryStack<{ id: string }, User, UserPages>({
      id: 'demo-user',
      initial: 'details',
      useData: useUserData,
      screens: { details: { title: 'User details', component: UserDetails } },
    }),
    item: defineSecondaryStack<{ id: string }, Item, ItemPages>({
      id: 'demo-item',
      initial: 'details',
      useData: useItemData,
      screens: { details: { title: 'Item details', component: ItemDetails } },
    }),
  };
}
export type DemoStacks = ReturnType<typeof createDemoStacks>;
