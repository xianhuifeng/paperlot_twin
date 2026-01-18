
import type { LotEvent } from "@/domain/events";

export type StoredEvent = {
  eventId: string;
  streamId: string;
  occurredAt: string;
  createdAt: string;
  event: LotEvent;
};

class InMemoryEventStore {
  private events: StoredEvent[] = [];

  append(lotId: string, event: LotEvent): StoredEvent {
    const stored: StoredEvent = {
      eventId: crypto.randomUUID(),
      streamId: lotId,
      occurredAt: event.occurredAt,
      createdAt: new Date().toISOString(),
      event
    };
    this.events.push(stored);
    this.events.sort((a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
    );
    return stored;
  }

  queryByTime(lotId: string, from?: string, to?: string): StoredEvent[] {
    const fromT = from ? new Date(from).getTime() : -Infinity;
    const toT = to ? new Date(to).getTime() : Infinity;
    return this.events.filter(e =>
      e.streamId === lotId &&
      new Date(e.occurredAt).getTime() >= fromT &&
      new Date(e.occurredAt).getTime() <= toT
    );
  }
}

export const eventStore = new InMemoryEventStore();

// src/infra/eventStore.ts
import { randomUUID } from "crypto";

export async function appendEvent(streamId: string, event: any, occurredAtIso?: string) {
  const occurredAt = occurredAtIso ?? new Date().toISOString();
  const createdAt = new Date().toISOString();

  const stored = {
    eventId: randomUUID(),
    streamId,
    occurredAt,
    createdAt,
    event,
  };

  // TODO: Replace this with your real storage (file/db/in-memory)
  // e.g. EVENT_STORE.append(stored)
  //await globalThis.__paperlot_store?.append?.(stored);

  return stored;
}
