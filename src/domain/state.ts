
import type { XY } from "./events";

export type CarState = {
  carId: string;
  pos: XY;
  status: "IN";
  updatedAt: string;
};

export type SpotOccupancy = {
  spotId: string;
  carId: string;
  since: string; // ISO
};

export type LotState = {
  lotId: string;
  time: string;
  cars: Record<string, CarState>;
  spots: Record<string, SpotOccupancy>; // NEW
};

export function emptyLotState(lotId: string, time: string): LotState {
  return { lotId, time, cars: {}, spots: {} };
}
