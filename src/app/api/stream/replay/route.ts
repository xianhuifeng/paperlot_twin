
import { eventStore } from "@/infra/eventStore";
import { replayEventsAsStream } from "@/infra/replay";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lotId = url.searchParams.get("lotId") ?? "001";
  const start = url.searchParams.get("start")!;
  const speed = Number(url.searchParams.get("speed") ?? "1");

  const events = eventStore.queryByTime(lotId, start);

  const encoder = new TextEncoder();
  let aborted = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj:any) => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch (err) {
          // Controller already closed, ignore
        }
      };

      replayEventsAsStream(events, speed, e => send(e), () => aborted)
        .then(() => {
          if (!aborted) {
            try {
              controller.close();
            } catch (err) {
              // Controller already closed, ignore
            }
          }
        })
        .catch((err) => {
          // Handle any errors during replay
          if (!aborted) {
            try {
              controller.close();
            } catch (closeErr) {
              // Controller already closed, ignore
            }
          }
        });
    },
    cancel() { aborted = true; }
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream" }
  });
}
