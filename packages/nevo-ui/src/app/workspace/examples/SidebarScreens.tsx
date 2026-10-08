import { useState, type ReactNode } from 'react';
import { Button } from '../../../components';
import {
  AppContent,
  AppWorkspaceBody,
  useSecondaryStack,
  type SecondaryScreenProps,
} from '../../index';
import type { Todo, User, Item } from './DemoStore';

export interface TodoPages {
  details: Record<never, never>;
  history: Record<never, never>;
  event: { eventId: string };
}
export interface UserPages {
  details: Record<never, never>;
}
export interface ItemPages {
  details: Record<never, never>;
}
let mountSequence = 0;

function Mounted({ children }: { children: ReactNode }) {
  const [instance] = useState(() => ++mountSequence);
  return (
    <AppContent className="w-content-narrow max-w-full">
      <AppWorkspaceBody>
        <div data-screen-mount={instance}>
          {children}
          <small>Mount #{instance}</small>
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}

export function TodoDetails({ data: todo }: SecondaryScreenProps<Todo, TodoPages['details']>) {
  const nav = useSecondaryStack<TodoPages>();
  return (
    <Mounted>
      <div className="grid gap-3 p-4">
        <strong>{todo.title}</strong>
        <output data-updated-at>{todo.updatedAt}</output>
        <Button onClick={() => void nav.navTo('history')}>Todo history</Button>
      </div>
    </Mounted>
  );
}
export function TodoHistory({ data: todo }: SecondaryScreenProps<Todo, TodoPages['history']>) {
  const nav = useSecondaryStack<TodoPages>();
  return (
    <Mounted>
      <div className="grid gap-3 p-4">
        <strong>{todo.title} history</strong>
        <output data-updated-at>{todo.updatedAt}</output>
        {todo.history.map((event) => (
          <Button key={event.id} onClick={() => void nav.navTo('event', { eventId: event.id })}>
            Open {event.id}
          </Button>
        ))}
      </div>
    </Mounted>
  );
}
export function TodoEvent({ data: todo, params }: SecondaryScreenProps<Todo, TodoPages['event']>) {
  const event = todo.history.find((item) => item.id === params.eventId);
  return (
    <Mounted>
      <div className="grid gap-3 p-4">
        <strong>{todo.title} event</strong>
        <output data-updated-at>{todo.updatedAt}</output>
        {event ? (
          <p>{event.label}</p>
        ) : (
          <p role="status">This history entry is no longer available.</p>
        )}
      </div>
    </Mounted>
  );
}
export function UserDetails({ data: user }: SecondaryScreenProps<User, UserPages['details']>) {
  return (
    <Mounted>
      <div className="grid gap-3 p-4">
        <strong>{user.name}</strong>
        <output data-updated-at>{user.updatedAt}</output>
      </div>
    </Mounted>
  );
}
export function ItemDetails({ data: item }: SecondaryScreenProps<Item, ItemPages['details']>) {
  return (
    <Mounted>
      <div className="grid gap-3 p-4">
        <strong>{item.label}</strong>
        <output data-updated-at>{item.updatedAt}</output>
      </div>
    </Mounted>
  );
}
