# How It Works

A deep-dive into the internals of detect-backend-threat — every component explained from first principles.

---

## The Journey of a Security Event

Every event follows the same path. Here it is end-to-end.

### Step 1 — Event Arrives

A security agent, SIEM, or developer sends an event to the ingest layer:

```bash
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{
    "source_ip":  "185.220.101.47",
    "event_type": "http_request",
    "severity":   "high",
    "file_hash":  "d41d8cd98f00b204e9800998ecf8427e"
  }'
```

Or via WebSocket for a persistent high-throughput connection:

```javascript
ws.send(JSON.stringify({ source_ip: "1.2.3.4", event_type: "login_attempt" }))
```

### Step 2 — Rate Limiting

The ingest layer checks the per-IP **token bucket** before doing anything:

```
bucket capacity:    1000 tokens
refill rate:        500 tokens/second
cost per request:   1 token
```

If the bucket is empty → immediate `429 Too Many Requests`. No Zod, no Redis.

This protects both the ingest service and Redis from being overwhelmed by a single client.

### Step 3 — Schema Validation

Every event passes through Zod validation:

```typescript
const result = EventPayloadSchema.safeParse(req.body);
if (!result.success) {
    return res.status(400).json({ error: "validation_failed", issues: result.error.issues });
}
```

Zod enforces:
- `source_ip` is a valid IPv4 or IPv6 address (not just a string)
- `event_type` is one of the six allowed enum values
- `file_hash` matches `/^[a-f0-9]{32}$|^[a-f0-9]{64}$/` if present
- `mitre_tactic` matches `/^TA\d{4}$/` if present

Malformed events never reach Redis. This is the first defense line.

### Step 4 — Published to Redis Streams

Validated events are published with a single command:

```typescript
await redis.xadd("threats:stream", "*", "payload", JSON.stringify(validatedEvent))
```

The `*` tells Redis to auto-generate the entry ID as `<milliseconds>-<sequence>`. This gives each event a globally unique, monotonically increasing ID that can be used for ordered replay.

### Step 5 — Detection Engine Reads the Stream

The Go detector runs a blocking read loop:

```go
for {
    result := redis.XRead(ctx, &redis.XReadArgs{
        Streams: []string{"threats:stream", lastId},
        Count:   50,
        Block:   5 * time.Second,
    })
    // process up to 50 events per read
    // update lastId to the highest ID seen
}
```

`XREAD BLOCK 5000` means: "give me up to 50 new entries, wait up to 5 seconds if there are none." This is more efficient than polling.

### Step 6 — Multi-Engine Detection

For each event, the engine calls up to three scanners. These calls happen **sequentially** in Phase 1 (parallel goroutines are Phase 4):

```go
// ClamAV — only if file payload present
if len(event.Payload) > 0 && e.clam != nil {
    verdict, err := e.clam.ScanBuffer(ctx, event.Payload)
}

// VirusTotal — only if file hash present
if event.FileHash != "" && e.vt != nil {
    report, err := e.vt.LookupHash(ctx, event.FileHash)
}

// AbuseIPDB — always (for any IP)
if event.SourceIP != "" && e.abuse != nil {
    ipReport, err := e.abuse.CheckIP(ctx, event.SourceIP)
}
```

Each call emits an OpenTelemetry span. You can see the full trace tree in Jaeger/Tempo.

### Step 7 — Severity Computation

All signals feed into a single `computeSeverity()` function that uses the `escalate()` helper — it only ever increases severity, never decreases it:

```go
func escalate(current, candidate string) string {
    rank := map[string]int{"low": 0, "medium": 1, "high": 2, "critical": 3}
    if rank[candidate] > rank[current] {
        return candidate
    }
    return current
}
```

This means: if ClamAV says `critical` and AbuseIPDB says `low`, the final severity is `critical`.

### Step 8 — MITRE Tactic Assignment

The tactic is assigned based on the **primary detection signal**:

```go
func (e *Engine) inferMitreTactic(r *Result) string {
    if r.ClamVerdict != nil && !r.ClamVerdict.Clean {
        return "TA0002"  // Execution — malware was executed
    }
    if r.VTReport != nil && r.VTReport.Malicious > 0 {
        return "TA0001"  // Initial Access — malicious file seen
    }
    if r.IPReport != nil && r.IPReport.AbuseScore >= 50 {
        return "TA0011"  // Command and Control — bad actor IP
    }
    return "TA0043"      // Reconnaissance — default
}
```

### Step 9 — Persisted to TimescaleDB

The verdict, severity, and tactic are written to the `events` hypertable:

```sql
INSERT INTO events (
    timestamp, source_ip, event_type, payload,
    severity, mitre_tactic, verdict,
    file_hash, clamav_sig, vt_malicious, abuse_score
) VALUES (...)
```

TimescaleDB automatically places this row in the correct time-based chunk. The continuous aggregate `threat_summary_1m` will pick it up within 1 minute.

### Step 10 — Dashboard Receives the Event

**Simultaneously** with Step 5 (the detector reading the stream), the dashboard's WebSocket API route is also reading the same stream via a separate `XREAD BLOCK` loop.

When a new entry arrives, it's broadcast to **all connected dashboard clients**:

```typescript
function broadcast(data: string) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(data);
    });
}
```

The dashboard clients receive the raw event (before detection enrichment in Phase 1 — full enrichment fan-out comes in Phase 4). The `useEventStream` hook updates the singleton store, which triggers `useSyncExternalStore` to re-render only the components that need it.

---

## ClamAV INSTREAM Protocol

ClamAV's TCP protocol is underdocumented. Here's exactly how it works:

```
Client → Server: "nINSTREAM\n"
Client → Server: [4 bytes big-endian: chunk_length][chunk_data]
Client → Server: [4 bytes: 0x00000000]   ← zero-length chunk = EOF
Server → Client: "stream: OK\n"
             or: "stream: Eicar-Test-Signature FOUND\n"
             or: "stream: ERROR <message>\n"
```

The `n` prefix before `INSTREAM` means "null-delimited" — ClamAV supports two command termination modes: `\n` and `\0`.

This protocol scans entirely in-memory — no temp files on disk, no shell invocation. It's why ClamAV scans at 5–15ms instead of hundreds of milliseconds.

---

## Redis LRU Cache Design

AbuseIPDB has a free tier limit of 1000 requests/day. For a platform seeing thousands of events/day with repeat IPs, this would be exhausted in minutes without caching.

The cache design:

```
Key format:    "abuseipdb:<ip>"
Value:         JSON-serialized IPReport struct
TTL:           1 hour (scores don't change faster than this in practice)
Max entries:   50,000 (Redis allkeys-lru handles eviction automatically)
```

On a cache hit, `CheckIP()` returns the cached score in ~0.5ms instead of ~100ms for an API call. For a platform seeing 100 unique IPs/hour, this reduces AbuseIPDB API calls from 100/hour to ~5/hour (repeat IPs).

The `allkeys-lru` policy ensures the 50,000-entry cap is enforced by Redis itself — no cleanup code needed.

---

## Three.js Globe Performance

500 animated arc particles at 60fps is a non-trivial rendering challenge. The key insight is **instanced mesh rendering**.

### Why Instanced Mesh?

Without instancing, 500 arcs × 32 particles each = 16,000 separate Three.js `Mesh` objects. Each mesh is a separate draw call to the GPU. 16,000 draw calls per frame = ~1fps on any GPU.

With instancing, all 16,000 particles share **one** `InstancedMesh`. The GPU receives one batch of 16,000 transform matrices + colors and renders them in a single draw call. This is the difference between 1fps and 60fps.

### Per-Frame Update Loop

Every animation frame (`requestAnimationFrame`):

1. For each arc: advance `progress += speed` (0.008–0.014 per frame)
2. Compute `head = floor(progress × 31)` — which particle is at the front
3. Compute `tail = max(0, head - 8)` — trailing 8 particles
4. For each particle from tail to head:
   - Copy position from precomputed Bezier curve points
   - Set color = arc color × fade factor (brighter at head, fading at tail)
   - Write matrix + color into the instanced buffer
5. Set `instanceMatrix.needsUpdate = true` — one GPU buffer upload
6. Render: `renderer.render(scene, camera)` — one draw call

The result: smooth 60fps even on a laptop integrated GPU.

---

## `useSyncExternalStore` Pattern

Most React WebSocket integrations use `useEffect` + `useState`, which has a subtle problem: multiple component instances create multiple WebSocket connections.

`useSyncExternalStore` solves this by separating the **store** (module-level singleton) from the **subscription** (React hook):

```typescript
// Singleton — lives outside React, created once
const eventStore = createStore()

// Hook — subscribes any number of components to the same store
function useEventStream() {
    // React re-renders this component whenever the store changes
    const events = useSyncExternalStore(
        eventStore.subscribe,    // how to subscribe
        eventStore.getSnapshot,  // what to read (client)
        () => []                 // what to read (server, for SSR)
    )
}
```

No matter how many components call `useEventStream()`, there is exactly one WebSocket connection and one store. When the store updates, React re-renders all subscribers efficiently.

---

## react-virtual Feed Performance

The event feed must handle 100,000+ rows without layout jank. The key techniques:

### 1. Virtualization (`@tanstack/react-virtual`)

Only ~25 rows are in the DOM at any time (visible rows + 20 overscan). The rest exist only as a total height reservation. Scrolling swaps which rows are rendered.

### 2. `contain: strict`

Each row has `contain: strict` in CSS. This tells the browser: "this row's layout and paint are fully contained — changes inside don't affect outside." The browser can skip painting off-screen rows entirely.

### 3. Event Prepending Without Scroll Jump

New events are prepended with `[newEvent, ...existing].slice(0, 50_000)`. The virtualizer handles this correctly because it measures from the top — existing rows keep their positions, the new row is added above.

### 4. Debounced Filter (200ms)

Filter changes are debounced: the filter only runs 200ms after the user stops typing. This prevents the expensive `useMemo` filter operation from running on every keystroke.
