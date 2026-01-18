
import { fold } from "@/domain/fold";
import { emptyLotState, type LotState } from "@/domain/state";
import type { LotEvent } from "@/domain/events";
import { isoNow } from "./time";

class Projector {
  private current = new Map<string, LotState>();

  apply(event: LotEvent): LotState {
    const prev = this.current.get(event.lotId) ?? emptyLotState(event.lotId, isoNow());
    const next = fold(prev, [event]);
    this.current.set(event.lotId, next);
    return next;
  }

  get(lotId: string): LotState {
    return this.current.get(lotId) ?? emptyLotState(lotId, isoNow());
  }
}

export const projector = new Projector();
