# PaperLot Twin (SVG UI)

Event-sourced Digital Twin: the map is a projection of an immutable event log.

- Rewind & replay any moment (time travel)
- Compute truth-at-time metrics (dwell, occupancy)
- YOLO detections can become events in the same stream

---

## 🧠 Core Idea

Instead of storing only the *current state* of the world, we store **every change as an event**.

Examples of events:
- `CarEntered`
- `CarMoved`
- `SpotOccupied`
- `SpotVacated`
- `CarExited`

From these events, we **compute projections**:
- Current lot state
- Historical state at any point in time
- Replays of what actually happened

> **State is a projection.  
> Events are the source of truth.**

---

## 🅿️ What This Demo Shows

### 1. Event-Sourced Digital Twin
- The UI is **not hard-coded animation**
- Every visual change comes from events
- You can scrub the timeline and see the lot at any moment

### 2. Time Travel & Replay
- Move the timeline slider → UI recomputes state at that time
- Press Play → events are replayed in order
- This works because the full event history exists

### 3. SVG-Based Twin (No 3D Engine Required)
- Uses SVG for clarity, stability, and smoothness
- Each car, lane, and parking spot is a real domain object
- Easy to explain and extend

### 4. Future-Ready for AI / YOLO
In a future version:
- YOLO detections → domain events
- Events → same event stream
- UI + analytics automatically stay consistent

No coupling between:
- Sensors
- UI
- Storage
- Analytics

---

## 🧩 Architecture (High Level)

YOLO / Sensors (future)
↓
Domain Events
↓
Event Store
↓
Projections
↓
Digital Twin UI (SVG)


- **Event Store**: append-only log
- **Projection**: derived state (cars, spots, occupancy)
- **UI**: visualizes projections, not raw data

---

## ▶️ How to Run

### 1. Install & start
```bash
npm install
npm run dev
```
### 2. Seed demo data
```bash
./seed.sh
```
### 3. Open the UI
```
http://localhost:3000
```
- Use Play to replay events
- Use timeline slider to time-travel
- Watch parking spots fill and empty
