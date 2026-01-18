"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LotEvent } from "@/domain/events";
import type { StoredEvent } from "@/infra/eventStore";

type XY = { x: number; y: number };

type LotState = {
  lotId: string;
  time: string;
  cars: Record<string, { carId: string; pos: XY; status: "IN"; updatedAt: string }>;
  spots: Record<string, { spotId: string; carId: string; since: string }>;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function Home() {
  const lotId = "001";

  // UI controls
  const [mode, setMode] = useState<"idle" | "playing" | "paused">("idle");
  const [speed, setSpeed] = useState<number>(1.0);

  // timeline
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [tMin, setTMin] = useState<number>(0);
  const [tMax, setTMax] = useState<number>(0);
  const [cursor, setCursor] = useState<number>(0); // unix ms

  // state for canvas animation
  const [state, setState] = useState<LotState | null>(null);

  // animation “targets” (where cars should go)
  const targetsRef = useRef<Map<string, XY>>(new Map());
  // animation “current” positions (smoothly interpolate)
  const animRef = useRef<Map<string, XY>>(new Map());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const stateRef = useRef<LotState | null>(null);

  const snapRef = useRef(false);


  const cursorIso = useMemo(() => {
    if (!cursor) return "";
    return new Date(cursor).toISOString();
  }, [cursor]);

  // 1) Load all events (for timeline bounds)
  async function loadEvents() {
    const res = await fetch(`/api/query/events?lotId=${lotId}`);
    const json = await res.json();
    const list: StoredEvent[] = json.events ?? [];
    setEvents(list);

    if (list.length > 0) {
      const min = new Date(list[0].occurredAt).getTime();
      const max = new Date(list[list.length - 1].occurredAt).getTime();
      setTMin(min);
      setTMax(max);
      setCursor(min);
    } else {
      const now = Date.now();
      setTMin(now);
      setTMax(now + 1000);
      setCursor(now);
    }
  }

  // 2) Time travel query for cursor
  async function loadStateAt(ms: number) {
    const at = new Date(ms).toISOString();
    const res = await fetch(`/api/query/state?lotId=${lotId}&at=${encodeURIComponent(at)}`);
    const json = await res.json();
    if (json?.ok) {
      setState(json.state as LotState);

      // sync targets + anim maps
      const cars = json.state.cars as LotState["cars"];
      const nextTargets = new Map<string, XY>();
      const nextAnim = new Map<string, XY>();

      for (const [carId, c] of Object.entries(cars)) {
        nextTargets.set(carId, c.pos);
        // keep existing anim pos if exists, else snap to state
        const prev = animRef.current.get(carId) ?? c.pos;
        nextAnim.set(carId, prev);
      }

      targetsRef.current = nextTargets;
      animRef.current = nextAnim;
    }
  }

  // 3) SSE replay (play mode)
  function startReplay(startIso: string) {
    stopReplay();

    const url = `/api/stream/replay?lotId=${lotId}&start=${encodeURIComponent(startIso)}&speed=${speed}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);

        // If you used the earlier "envelope" format:
        // { type:"LotEvent", stored:{...} }
        // In this Step-2 UI we support BOTH envelope and raw stored event.
        const stored: StoredEvent = data?.stored ?? data;

        if (!stored?.event?.type) return;

        const t = new Date(stored.occurredAt).getTime();
        setCursor(t);

        // apply event to targets map
        const ev = stored.event;
        const targets = new Map(targetsRef.current);
        const anim = new Map(animRef.current);

        switch (ev.type) {
          case "CarEntered":
            targets.set(ev.carId, ev.pos);
            if (!anim.has(ev.carId)) anim.set(ev.carId, ev.pos);
            break;
        
          case "CarMoved":
            targets.set(ev.carId, ev.to);
            if (!anim.has(ev.carId)) anim.set(ev.carId, ev.from);
            break;
        
          case "CarExited":
            targets.delete(ev.carId);
            anim.delete(ev.carId);
            break;
        
          case "SpotOccupied":
          case "SpotVacated":
            // spots change, but car animation target doesn't need to change
            break;
        
          default:
            break;
        }
        
        snapRef.current = true;
        targetsRef.current = targets;
        animRef.current = anim;


        // update “state view” (lightweight)
        setState((prev) => {
          const base: LotState =
            prev ?? { lotId, time: stored.occurredAt, cars: {} as any, spots: {} };
        
          const cars = { ...base.cars };
          const spots = { ...base.spots };
        
          if (ev.type === "CarEntered") {
            cars[ev.carId] = { carId: ev.carId, pos: ev.pos, status: "IN", updatedAt: ev.occurredAt };
          } else if (ev.type === "CarMoved") {
            if (cars[ev.carId]) cars[ev.carId] = { ...cars[ev.carId], pos: ev.to, updatedAt: ev.occurredAt };
          } else if (ev.type === "CarExited") {
            delete cars[ev.carId];
            // optional: clear any spots held by this car
            for (const [sid, occ] of Object.entries(spots)) {
              if (occ.carId === ev.carId) delete spots[sid];
            }
          } else if (ev.type === "SpotOccupied") {
            spots[ev.spotId] = { spotId: ev.spotId, carId: ev.carId, since: ev.occurredAt };
          } else if (ev.type === "SpotVacated") {
            if (spots[ev.spotId]?.carId === ev.carId) delete spots[ev.spotId];
          }
        
          return { lotId, time: stored.occurredAt, cars, spots };
        });
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      // stop on error (server closes after completed too)
      stopReplay();
      setMode("idle");
    };
  }

  function stopReplay() {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }

  // init
  useEffect(() => {
    loadEvents();
    // cleanup
    return () => stopReplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // whenever cursor changes in idle/paused, time-travel fetch
  useEffect(() => {
    if (!cursor) return;
    if (mode === "playing") return;
    loadStateAt(cursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, mode]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  

  // Canvas animation loop
  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(tick);
        return;
      }

      // resize to container
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      // background
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0b1020";
      ctx.fillRect(0, 0, w, h);

      // draw "lot"
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, w - 40, h - 40);

      // smooth move toward targets
      const targets = targetsRef.current;
      const anim = new Map(animRef.current);
      const shouldSnap = snapRef.current;

      for (const [carId, target] of targets.entries()) {
        if (shouldSnap) {
          anim.set(carId, target); // snap to exact event position
        } else {
          const cur = anim.get(carId) ?? target;
          const alpha = 0.12;
          const nx = cur.x + (target.x - cur.x) * alpha;
          const ny = cur.y + (target.y - cur.y) * alpha;
          anim.set(carId, { x: nx, y: ny });
        }
      }
      
      if (shouldSnap) snapRef.current = false;
      
      // persist anim positions
      animRef.current = anim;

      // draw cars
      for (const [carId, pos] of anim.entries()) {
        // map “world coords” 0..100 to canvas inner rect
        const ix = 20 + (w - 40) * (pos.x / 100);
        const iy = 20 + (h - 40) * (pos.y / 100);

        ctx.beginPath();
        ctx.fillStyle = "#ffd166";
        ctx.arc(ix, iy, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "12px system-ui";
        ctx.fillText(carId, ix + 14, iy + 4);
      }


      function worldToCanvas(w:number,h:number, x:number, y:number){
        const ix = 20 + (w - 40) * (x / 100);
        const iy = 20 + (h - 40) * (y / 100);
        return { ix, iy };
      }
      
      function sizeToCanvas(w:number,h:number, ww:number, hh:number){
        return {
          iw: (w - 40) * (ww / 100),
          ih: (h - 40) * (hh / 100)
        };
      }
      
      // draw spots
      for (const s of SPOTS) {
        const p = worldToCanvas(w,h,s.x,s.y);
        const sz = sizeToCanvas(w,h,s.w,s.h);

        const occupied = stateRef.current?.spots?.[s.spotId]; // { spotId, carId, since }  from stateRef

        if (occupied) {
          ctx.fillStyle = "rgba(255, 80, 80, 0.35)";
          ctx.fillRect(p.ix, p.iy, sz.iw, sz.ih);
    
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.font = "12px system-ui";
          ctx.fillText(
            occupied.carId,
            p.ix + 4,
            p.iy + sz.ih - 4
          );
        } else {
          ctx.fillStyle = "rgba(80, 255, 120, 0.10)";
          ctx.fillRect(p.ix, p.iy, sz.iw, sz.ih);
        }
    
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(p.ix, p.iy, sz.iw, sz.ih);
      
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "12px system-ui";
        ctx.fillText(s.spotId, p.ix + 4, p.iy + 14);

      }


      //draw lanes
      ctx.strokeStyle = "rgba(0,255,255,0.2)";
      ctx.lineWidth = 3;
      for (const l of LANES) {
        const p1 = worldToCanvas(w,h,l.a.x,l.a.y);
        const p2 = worldToCanvas(w,h,l.b.x,l.b.y);
        ctx.beginPath();
        ctx.moveTo(p1.ix, p1.iy);
        ctx.lineTo(p2.ix, p2.iy);
        ctx.stroke();
      }
      
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); // ✅ START IT
    return () => cancelAnimationFrame(raf);
  }, []);

  // Play / Pause
  function onPlay() {
    if (!cursor) return;
    setMode("playing");
    startReplay(new Date(cursor).toISOString());
  }
  function onPause() {
    setMode("paused");
    stopReplay();
  }
  function onStop() {
    setMode("idle");
    stopReplay();
  }

  return (
    <main style={{ padding: 16, fontFamily: "system-ui", color: "white" }}>
      <h1 style={{ margin: "8px 0 12px" }}>PaperLot Twin UI (Step 2)</h1>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <button onClick={onPlay} disabled={mode === "playing"}>▶ Play</button>{" "}
          <button onClick={onPause} disabled={mode !== "playing"}>⏸ Pause</button>{" "}
          <button onClick={onStop}>⏹ Stop</button>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Speed
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.25}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
          <span>{speed.toFixed(2)}×</span>
        </label>

        <button onClick={loadEvents}>↻ Reload Events</button>
      </div>

      {/* Timeline */}
      <div style={{ marginTop: 12 }}>
        <div style={{ opacity: 0.85, fontSize: 12 }}>
          Cursor: <code>{cursorIso}</code> · Events: {events.length} · Mode: {mode}
        </div>

        <input
          style={{ width: "100%", marginTop: 6 }}
          type="range"
          min={tMin}
          max={tMax}
          value={clamp(cursor, tMin, tMax)}
          step={100}
          onChange={(e) => setCursor(Number(e.target.value))}
          disabled={mode === "playing"}
        />
      </div>

      {/* Canvas */}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 320px", gap: 12 }}>
        <div style={{ border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
            <b>Lot View</b> (canvas)
          </div>
          <div style={{ height: 520 }}>
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
          </div>
        </div>

        {/* Debug panel */}
        <div style={{ border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: 12 }}>
          <b>State</b>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
            Lot: {lotId}<br />
            Time: {state?.time ?? "(none)"}<br />
            Cars: {state ? Object.keys(state.cars).length : 0}
          </div>
          <pre style={{ marginTop: 10, fontSize: 11, whiteSpace: "pre-wrap" }}>
{JSON.stringify(state, null, 2)}
          </pre>
        </div>
      </div>

      <p style={{ marginTop: 14, opacity: 0.8, fontSize: 12 }}>
        Tip: 先用 curl 写几条事件，然后点 Play。车会在 canvas 里“咕唧咕唧”移动。
      </p>
    </main>
  );
}

type Spot = { spotId: string; x: number; y: number; w: number; h: number };

const SPOTS: Spot[] = [
  { spotId: "S1", x: 20, y: 20, w: 14, h: 10 },
  { spotId: "S2", x: 38, y: 20, w: 14, h: 10 },
  { spotId: "S3", x: 56, y: 20, w: 14, h: 10 },
  { spotId: "S4", x: 74, y: 20, w: 14, h: 10 },

  { spotId: "S5", x: 20, y: 38, w: 14, h: 10 },
  { spotId: "S6", x: 38, y: 38, w: 14, h: 10 },
  { spotId: "S7", x: 56, y: 38, w: 14, h: 10 },
  { spotId: "S8", x: 74, y: 38, w: 14, h: 10 }
];
const LANES = [
  { a: { x: 10, y: 60 }, b: { x: 90, y: 60 } },
  { a: { x: 10, y: 75 }, b: { x: 90, y: 75 } }
];
