
import type { LotEvent } from "./events";
import type { LotState } from "./state";

export function fold(initial: LotState, events: LotEvent[]): LotState {
  const state: LotState = {
    lotId: initial.lotId,
    time: initial.time,
    cars: { ...initial.cars },
    spots: { ...initial.spots }
  };

  for (const e of events) {
    switch (e.type) {
      case "CarEntered":
        state.cars[e.carId] = {
          carId: e.carId,
          pos: e.pos,
          status: "IN",
          updatedAt: e.occurredAt
        };
        state.time = e.occurredAt;
        break;
      case "CarMoved":
        if (state.cars[e.carId]) {
          state.cars[e.carId] = {
            ...state.cars[e.carId],
            pos: e.to,
            updatedAt: e.occurredAt
          };
          state.time = e.occurredAt;
        }
        break;
      case "CarExited":
        delete state.cars[e.carId];
        state.time = e.occurredAt;
        break;

      case "SpotOccupied":
        state.spots[e.spotId] = { spotId: e.spotId, carId: e.carId, since: e.occurredAt };
        state.time = e.occurredAt;
        break;

      case "SpotVacated":
        // 只在当前是同一辆车占用时才释放（避免乱序）
        if (state.spots[e.spotId]?.carId === e.carId) {
          delete state.spots[e.spotId];
        }
        state.time = e.occurredAt;
        break;

    }
  }
  return state;
}
