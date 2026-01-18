
export type XY = { x: number; y: number };

export type CarEntered = {
  type: "CarEntered";
  lotId: string;
  carId: string;
  pos: XY;
  occurredAt: string;
};

export type CarMoved = {
  type: "CarMoved";
  lotId: string;
  carId: string;
  from: XY;
  to: XY;
  durationMs?: number;
  occurredAt: string;
};

export type CarExited = {
  type: "CarExited";
  lotId: string;
  carId: string;
  occurredAt: string;
};

export type SpotOccupied = {
  type: "SpotOccupied";
  lotId: string;
  carId: string;
  spotId: string;
  occurredAt: string;
};

export type SpotVacated = {
  type: "SpotVacated";
  lotId: string;
  carId: string;
  spotId: string;
  occurredAt: string;
};

// 合并进 LotEvent
export type LotEvent = CarEntered | CarMoved | CarExited | SpotOccupied | SpotVacated;

