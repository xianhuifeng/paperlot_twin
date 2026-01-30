
import type { LotEvent } from "@/domain/events";
import { createJsonlEventStore } from "@/infra/eventStore.jsonl";


export type StoredEvent<E = any> = E & {
  _id: string;        // uuid
  _seq: number;       // monotonically increasing
  _storedAt: string;  // ISO
};

export interface EventStore<E = any> {
  append(streamId: string, event: E): Promise<StoredEvent<E>>;
  load(streamId: string): Promise<StoredEvent<E>[]>;
  queryByTime(streamId: string, from?: string, to?: string): StoredEvent<E>[];
}

export const eventStore = createJsonlEventStore();

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
