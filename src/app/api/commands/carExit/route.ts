
import { NextResponse } from "next/server";
import { eventStore } from "@/infra/eventStore";
import { projector } from "@/infra/projector";
import { isoNow } from "@/infra/time";
import type { CarExited } from "@/domain/events";

export async function POST(req: Request) {
  const body = await req.json();
  const event: CarExited = {
    type: "CarExited",
    lotId: body.lotId,
    carId: body.carId,
    occurredAt: body.occurredAt ?? isoNow()
  };
  const stored = eventStore.append(event.lotId, event);
  const current = projector.apply(event);
  return NextResponse.json({ ok: true, stored, current });
}
