import { NextResponse } from "next/server";
import { eventStore } from "@/infra/eventStore";
import { projector } from "@/infra/projector";
import { isoNow, mustIso } from "@/infra/time";
import type { SpotVacated } from "@/domain/events";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  if (!body?.lotId || !body?.carId || !body?.spotId) {
    return NextResponse.json({ ok: false, error: "lotId, carId, spotId required" }, { status: 400 });
  }

  const event: SpotVacated = {
    type: "SpotVacated",
    lotId: String(body.lotId),
    carId: String(body.carId),
    spotId: String(body.spotId),
    occurredAt: body.occurredAt ? mustIso(String(body.occurredAt)) : isoNow()
  };

  const stored = eventStore.append(event.lotId, event);
  const current = projector.apply(event);

  return NextResponse.json({ ok: true, stored, current });
}
