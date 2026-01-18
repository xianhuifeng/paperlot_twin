"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StoredEvent } from "@/infra/eventStore";

type XY = { x: number; y: number };

type LotEvent =
  | { type: "CarEntered"; lotId: string; carId: string; pos: XY; occurredAt: string }
  | { type: "CarMoved"; lotId: string; carId: string; from: XY; to: XY; occurredAt: string; durationMs?: number }
  | { type: "CarExited"; lotId: string; carId: string; occurredAt: string }
  | { type: "SpotOccupied"; lotId: string; carId: string; spotId: string; occurredAt: string }
  | { type: "SpotVacated"; lotId: string; carId: string; spotId: string; occurredAt: string };

type LotState = {
  lotId: string;
  time: string;
  cars: Record<string, { carId: string; pos: XY; status: "IN"; updatedAt: string }>;
  spots: Record<string, { spotId: string; carId: string; since: string }>;
};
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


function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function dwellSeconds(occSinceIso: string, cursorMs: number) {
  const since = new Date(occSinceIso).getTime();
  return Math.max(0, Math.floor((cursorMs - since) / 1000));
}

function fmtDwell(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// simple heat ramp by dwell
function spotFill(occupied: boolean, dwellSec: number) {
  if (!occupied) return "rgba(80,255,120,0.10)";
  if (dwellSec < 10) return "rgba(255, 209, 102, 0.35)";   // yellow-ish
  if (dwellSec < 20) return "rgba(255, 140, 80, 0.35)";    // orange-ish
  return "rgba(255, 80, 80, 0.38)";                        // red-ish
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

  // rendered state (truth for SVG)
  const [state, setState] = useState<LotState | null>(null);
  // frame counter for animation
  const [frame, setFrame] = useState(0);
  
  // selection state
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  // animation refs (smooth motion)
  const animRef = useRef<Map<string, XY>>(new Map()); // current rendered pos
  const targetsRef = useRef<Map<string, XY>>(new Map()); // target pos
  const rafRef = useRef<number>(0);

  const esRef = useRef<EventSource | null>(null);

  const cursorIso = useMemo(() => (cursor ? new Date(cursor).toISOString() : ""), [cursor]);
	const eventsAtCursor = useMemo(() => {
		if (!cursor) return events;
		return events.filter((e) => new Date(e.occurredAt).getTime() <= cursor);
	}, [events, cursor]);
	
  // ---- 1) Load events for bounds
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

  // ---- 2) time travel fetch
  async function loadStateAt(ms: number) {
    const at = new Date(ms).toISOString();
    const res = await fetch(`/api/query/state?lotId=${lotId}&at=${encodeURIComponent(at)}`);
    const json = await res.json();
    if (!json?.ok) return;

    const next = json.state as LotState;
    setState(next);

    // sync animation refs
    const nextTargets = new Map<string, XY>();
    const nextAnim = new Map(animRef.current);

    for (const [carId, c] of Object.entries(next.cars)) {
      nextTargets.set(carId, c.pos);
      if (!nextAnim.has(carId)) nextAnim.set(carId, c.pos); // first time snap
    }

    // remove cars that no longer exist
    for (const carId of Array.from(nextAnim.keys())) {
      if (!nextTargets.has(carId)) nextAnim.delete(carId);
    }

    targetsRef.current = nextTargets;
    animRef.current = nextAnim;
  }

  // ---- 3) SSE replay
  function startReplay(startIso: string) {
    stopReplay();

    const url = `/api/stream/replay?lotId=${lotId}&start=${encodeURIComponent(startIso)}&speed=${speed}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        const stored: StoredEvent = data?.stored ?? data;
        const ev = stored?.event as LotEvent;
        if (!ev?.type) return;

        const t = new Date(stored.occurredAt).getTime();
        setCursor(t);

        // update targets/anim
        const targets = new Map(targetsRef.current);
        const anim = new Map(animRef.current);

        if (ev.type === "CarEntered") {
          targets.set(ev.carId, ev.pos);
          if (!anim.has(ev.carId)) anim.set(ev.carId, ev.pos);
        } else if (ev.type === "CarMoved") {
          targets.set(ev.carId, ev.to);
          if (!anim.has(ev.carId)) anim.set(ev.carId, ev.from);
        } else if (ev.type === "CarExited") {
          targets.delete(ev.carId);
          anim.delete(ev.carId);
        }

        targetsRef.current = targets;
        animRef.current = anim;

        // update state (truth used by SVG for spots + labels)
        setState((prev) => {
          const base: LotState = prev ?? { lotId, time: stored.occurredAt, cars: {}, spots: {} };
          const cars = { ...base.cars };
          const spots = { ...base.spots };

          if (ev.type === "CarEntered") {
            cars[ev.carId] = { carId: ev.carId, pos: ev.pos, status: "IN", updatedAt: ev.occurredAt };
          } else if (ev.type === "CarMoved") {
            if (cars[ev.carId]) cars[ev.carId] = { ...cars[ev.carId], pos: ev.to, updatedAt: ev.occurredAt };
          } else if (ev.type === "CarExited") {
            delete cars[ev.carId];
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

  // ---- animation loop (smoothly move animRef toward targetsRef)
  useEffect(() => {
    const tick = () => {
      const targets = targetsRef.current;
      const anim = new Map(animRef.current);

      for (const [carId, target] of targets.entries()) {
        const cur = anim.get(carId) ?? target;
        const alpha = 0.18; // slightly snappier than canvas
        anim.set(carId, { x: lerp(cur.x, target.x, alpha), y: lerp(cur.y, target.y, alpha) });
      }
      // remove cars that disappeared
      for (const carId of Array.from(anim.keys())) {
        if (!targets.has(carId)) anim.delete(carId);
      }

      animRef.current = anim;

      // force React to re-render SVG positions without heavy state:
      if (anim.size > 0) setFrame((f) => (f + 1) % 1000000);


      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // init
  useEffect(() => {
    loadEvents();
    return () => stopReplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

	useEffect(() => {
		if (!cursor || events.length === 0) return;
		const idx = events.findIndex((e) => new Date(e.occurredAt).getTime() >= cursor);
		const pick = idx === -1 ? events[events.length - 1] : events[idx];
		setSelectedEventId(pick.eventId);
	}, [cursor, events]);
	

  // cursor changes (idle/paused only)
  useEffect(() => {
    if (!cursor) return;
    if (mode === "playing") return;
    loadStateAt(cursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, mode]);

  // controls
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

  function selectStoredEvent(se: StoredEvent) {
    setSelectedEventId(se.eventId);
    const t = new Date(se.occurredAt).getTime();
    setCursor(t);

    const ev = se.event as any;
    setSelectedCarId(ev.carId ?? null);
    setSelectedSpotId(ev.spotId ?? null);
  }
	

  // ---- SVG rendering helpers
  const animCars = Array.from(animRef.current.entries()).map(([carId, pos]) => ({ carId, pos }));
  const spotOcc = state?.spots ?? {};

  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ margin: "8px 0 12px" }}>PaperLot Twin UI (SVG)</h1>
			<p style={{ margin: "6px 0 0", opacity: 0.8 }}>
  		<b>Event-sourced Digital Twin</b>: the map is a projection of an immutable event log.
			</p>
			<ul style={{ marginTop: 6, opacity: 0.8 }}>
				<li>Rewind & replay any moment (time travel)</li>
				<li>Compute truth-at-time metrics (dwell, occupancy)</li>
				<li>YOLO detections can become events in the same stream</li>
			</ul>

			<div style={{
				marginTop: 8,
				padding: 10,
				borderRadius: 10,
				background: "rgba(0,0,0,0.04)",
				display: "flex",
				gap: 16,
				flexWrap: "wrap"
			}}>
				<div><b>Cars</b>: {state ? Object.keys(state.cars).length : 0}</div>
				<div><b>Occupied</b>: {state ? Object.keys(state.spots).length : 0} / {SPOTS.length}</div>
				<div><b>Occupancy</b>: {state ? Math.round((Object.keys(state.spots).length / SPOTS.length) * 100) : 0}%</div>
				<div><b>Time</b>: <code>{cursorIso}</code></div>
			</div>

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
        <div style={{ opacity: 0.8, fontSize: 12 }}>
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

      {/* View */}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 40%", gap: 12 }}>
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
            <b>Lot View</b> (SVG)
          </div>

          <div style={{ height: 520, background: "#0b1020" }}>
            <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none">
						<defs>
							<filter id="glow">
								<feGaussianBlur stdDeviation="1.2" result="coloredBlur" />
								<feMerge>
									<feMergeNode in="coloredBlur" />
									<feMergeNode in="SourceGraphic" />
								</feMerge>
							</filter>
						</defs>

              {/* lot border */}
              <rect x="2" y="2" width="96" height="96" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" />

              {/* lanes */}
              {LANES.map((l, i) => (
                <line
                  key={i}
                  x1={l.a.x}
                  y1={l.a.y}
                  x2={l.b.x}
                  y2={l.b.y}
                  stroke="rgba(0,255,255,0.25)"
                  strokeWidth="1.2"
                />
              ))}

              {/* spots */}
              {SPOTS.map((s) => {
                const occ = spotOcc[s.spotId];
								const dwell = occ ? dwellSeconds(occ.since, cursor) : 0;
                const occupied = Boolean(occ);
								const spotSelected = s.spotId === selectedSpotId;
                return (
                  <g key={s.spotId}>
                    <rect
                      x={s.x}
                      y={s.y}
                      width={s.w}
                      height={s.h}
											fill={spotFill(occupied, dwell)}
                      //fill={occupied ? "rgba(255,80,80,0.35)" : "rgba(80,255,120,0.10)"}
                      stroke={spotSelected ? "rgba(255,209,102,0.95)" : "rgba(255,255,255,0.25)"}
  										strokeWidth={spotSelected ? "1.2" : "0.6"}
  										filter={spotSelected ? "url(#glow)" : undefined}
                      rx="1"
                      ry="1"
                    />
                    <text x={s.x + 1} y={s.y + 3.5} fontSize="2.8" fill="rgba(255,255,255,0.75)">
                      {s.spotId}
                    </text>
										{occupied && (
											<text x={s.x + 1} y={s.y + s.h - 1} fontSize="2.8" fill="rgba(255,255,255,0.9)">
												{occ!.carId} · {fmtDwell(dwell)}
											</text>
										)}

                  </g>
                );
              })}

              {/* cars (animated positions) */}
              {animCars.map((c) => {
                const isSelected = c.carId === selectedCarId;
                return (
                  <g key={c.carId}>
                    <circle
                      cx={c.pos.x}
                      cy={c.pos.y}
                      r="2.3"
                      fill="#ffd166"
                      filter={isSelected ? "url(#glow)" : undefined}
                    />
                    <text x={c.pos.x + 2.8} y={c.pos.y + 0.9} fontSize="3" fill="rgba(255,255,255,0.9)">
                      {c.carId}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Debug */}

        <div style={{ marginTop: 10 }}>
					<b>Event Log</b>
					<div style={{ maxHeight: 220, overflow: "auto", marginTop: 6, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8 }}>
						{eventsAtCursor.slice().reverse().map((se) => {
						const ev = se.event as any;
						const active = se.eventId === selectedEventId;
						const isFuture = new Date(se.occurredAt).getTime() > cursor;
						return (
							<div
							key={se.eventId}
							onClick={() => selectStoredEvent(se)}
							style={{
								cursor: "pointer",
								padding: "8px 10px",
								borderBottom: "1px solid rgba(0,0,0,0.06)",
								background: active ? "rgba(255, 209, 102, 0.25)" : "transparent",
								fontSize: 12,
								opacity: isFuture ? 0.35 : 1,
						    pointerEvents: isFuture ? "none" : "auto"

							}}
							>
							<div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
								<span><b>{ev.type}</b> {ev.carId ? `· ${ev.carId}` : ""}{ev.spotId ? ` · ${ev.spotId}` : ""}</span>
								<span style={{ opacity: 0.7 }}>{new Date(se.occurredAt).toLocaleTimeString()}</span>
							</div>
							</div>
							);
							})}
					</div>
        </div>

        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <b>State</b>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6, color: "#111" }}>
            Lot: {lotId}<br />
            Time: {state?.time ?? "(none)"}<br />
            Cars: {state ? Object.keys(state.cars).length : 0}<br />
            Spots occupied: {state ? Object.keys(state.spots).length : 0}
          </div>
          <pre style={{ marginTop: 10, fontSize: 11, whiteSpace: "pre-wrap", color: "#111" }}>{JSON.stringify(state, null, 2)}
          </pre>
        </div>
      </div>
    </main>
  );
}