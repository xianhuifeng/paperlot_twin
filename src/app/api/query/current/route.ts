
import { NextResponse } from "next/server";
import { projector } from "@/infra/projector";

export async function GET(req: Request) {
  const lotId = new URL(req.url).searchParams.get("lotId") ?? "001";
  return NextResponse.json({ ok: true, state: projector.get(lotId) });
}
