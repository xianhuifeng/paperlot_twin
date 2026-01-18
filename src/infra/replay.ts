
import type { StoredEvent } from "./eventStore";
import { msBetween, sleep } from "./time";

export async function replayEventsAsStream(
  events: StoredEvent[],
  speed: number,
  onEvent: (e: StoredEvent) => void,
  isAborted: () => boolean
) {
  if (!events.length) return;
  onEvent(events[0]);
  for (let i = 1; i < events.length; i++) {
    if (isAborted()) return;
    const wait = msBetween(events[i-1].occurredAt, events[i].occurredAt) / speed;
    if (wait > 0) await sleep(wait);
    onEvent(events[i]);
  }
}
