
import { NextResponse } from "next/server";
import { eventStore } from "@/infra/eventStore";
import { fold } from "@/domain/fold";
import { emptyLotState } from "@/domain/state";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lotId = url.searchParams.get("lotId") ?? "001";
  const at = url.searchParams.get("at");
  if (!at) return NextResponse.json({ ok:false, error:"at required" },{status:400});
  
  const storedEvents = eventStore.queryByTime(lotId, undefined, at);
  // Handle both structures: nested (e.event) or flat (e itself)
  const events = storedEvents.map(e => {
    const stored = e as any;
    // If event is nested, use it; otherwise extract event properties (exclude metadata)
    if (stored.event) return stored.event;
    // Extract event properties, excluding metadata fields
    const { _id, _seq, _storedAt, streamId, ...event } = stored;
    return event;
  }).filter(e => e && e.type); // Filter out invalid events
  
  const state = fold(emptyLotState(lotId, at), events);
  return NextResponse.json({ ok:true, state });
}
