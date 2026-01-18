
import { NextResponse } from "next/server";
import { eventStore } from "@/infra/eventStore";
import { fold } from "@/domain/fold";
import { emptyLotState } from "@/domain/state";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lotId = url.searchParams.get("lotId") ?? "001";
  const at = url.searchParams.get("at");
  if (!at) return NextResponse.json({ ok:false, error:"at required" },{status:400});
  const events = eventStore.queryByTime(lotId, undefined, at).map(e => e.event);
  const state = fold(emptyLotState(lotId, at), events);
  return NextResponse.json({ ok:true, state });
}
