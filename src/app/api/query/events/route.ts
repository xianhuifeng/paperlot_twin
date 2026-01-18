import { NextResponse } from "next/server";
import { eventStore } from "@/infra/eventStore";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lotId = url.searchParams.get("lotId") ?? "001";
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  const events = eventStore.queryByTime(lotId, from, to);
  return NextResponse.json({ ok: true, lotId, count: events.length, events });
}
