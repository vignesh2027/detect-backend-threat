# Ingest API Reference

The ingest service (`apps/ingest/`) exposes two interfaces for publishing security events: a **REST API** and a **WebSocket API**. Both validate every payload with Zod before publishing to Redis Streams.

---

## Base URL

```
http://localhost:4000        # default
http://<your-host>:4000      # configured via INGEST_PORT
```

---

## REST API

### `POST /events`

Publish a single security event to the detection pipeline.

**Request Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |

**Request Body:**

```json
{
  "source_ip":    "185.220.101.47",
  "event_type":   "http_request",
  "severity":     "high",
  "file_hash":    "d41d8cd98f00b204e9800998ecf8427e",
  "mitre_tactic": "TA0001",
  "timestamp":    "2024-05-28T15:30:00Z",
  "payload": {
    "user_agent": "Nuclei/2.9.0",
    "path":       "/admin/login",
    "method":     "POST",
    "status":     401
  }
}
```

**Fields:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|-----------|-------------|
| `source_ip` | string | ✅ | Valid IPv4 or IPv6 | IP address of the event source |
| `event_type` | enum | ✅ | See values below | Category of security event |
| `severity` | enum | ❌ | `low`/`medium`/`high`/`critical` | Reported severity, defaults to `low` |
| `file_hash` | string | ❌ | 32-char MD5 or 64-char SHA256, hex | File hash for VirusTotal lookup |
| `mitre_tactic` | string | ❌ | `TA` + 4 digits (e.g. `TA0001`) | MITRE ATT&CK tactic ID |
| `timestamp` | string | ❌ | ISO 8601 datetime | Event time, defaults to server time |
| `payload` | object | ❌ | Any JSON object | Arbitrary metadata (user-agent, path, etc.) |

**`event_type` values:**

| Value | Description |
|-------|-------------|
| `file_upload` | A file was uploaded — triggers ClamAV + VirusTotal scan |
| `network_connection` | Outbound/inbound TCP/UDP connection |
| `process_spawn` | A new process was created |
| `dns_query` | DNS lookup to external domain |
| `http_request` | HTTP/HTTPS request |
| `login_attempt` | Authentication attempt (success or failure) |

**Responses:**

=== "202 Accepted"

    ```json
    {
      "ok": true,
      "stream_id": "1716912345678-0"
    }
    ```
    Event accepted and published to `threats:stream`. The `stream_id` is the Redis Streams entry ID.

=== "400 Bad Request"

    ```json
    {
      "error": "validation_failed",
      "issues": [
        {
          "code": "invalid_type",
          "path": ["source_ip"],
          "message": "Invalid ip"
        }
      ]
    }
    ```
    Zod validation failed. Event was rejected — not published to Redis.

=== "429 Too Many Requests"

    ```json
    {
      "error": "rate_limited"
    }
    ```
    IP has exceeded the token bucket limit (1000 burst, 500/sec refill).

=== "500 Internal Server Error"

    ```json
    {
      "error": "internal_error"
    }
    ```
    Redis publish failed. Check Redis connectivity.

---

### `GET /health`

Returns the service health status.

```http
GET /health HTTP/1.1
Host: localhost:4000
```

**Response:**

```json
{
  "status": "ok",
  "ts": "2024-05-28T15:30:00.000Z"
}
```

---

## WebSocket API

### `ws://host:4000/ws/events`

Persistent bidirectional connection for real-time event streaming. Lower overhead than REST for high-volume ingest.

**Connect:**

=== "JavaScript"

    ```javascript
    const ws = new WebSocket('ws://localhost:4000/ws/events');

    ws.onopen = () => console.log('connected');
    ws.onmessage = (msg) => console.log('ack:', msg.data);
    ws.onclose = () => console.log('disconnected');
    ```

=== "Python"

    ```python
    import asyncio, websockets, json

    async def send_event():
        async with websockets.connect('ws://localhost:4000/ws/events') as ws:
            event = {
                "source_ip":  "1.2.3.4",
                "event_type": "login_attempt",
                "severity":   "critical"
            }
            await ws.send(json.dumps(event))
            ack = await ws.recv()
            print(ack)  # {"ok":true,"stream_id":"..."}

    asyncio.run(send_event())
    ```

=== "curl (wscat)"

    ```bash
    npm install -g wscat
    wscat -c ws://localhost:4000/ws/events
    > {"source_ip":"1.2.3.4","event_type":"http_request"}
    < {"ok":true,"stream_id":"1716912345678-0"}
    ```

**Send an event** (same schema as REST):

```json
{
  "source_ip":  "185.220.101.47",
  "event_type": "network_connection",
  "severity":   "high",
  "payload":    { "dest_port": 4444, "protocol": "tcp" }
}
```

**Receive responses:**

| Response | Meaning |
|----------|---------|
| `{"ok":true,"stream_id":"..."}` | Event accepted and published |
| `{"error":"rate_limited"}` | IP exceeded token bucket |
| `{"error":"invalid_json"}` | Message was not valid JSON |
| `{"error":"validation_failed","issues":[...]}` | Zod validation failed |
| `{"error":"internal_error"}` | Redis publish failed |

**Rate limiting:**

The WebSocket rate limiter uses the same token bucket as REST, keyed by client IP:
- **Capacity:** 1000 tokens per IP
- **Refill rate:** 500 tokens per second
- **Behavior when exceeded:** server sends `{"error":"rate_limited"}` and continues accepting messages (no disconnect)

---

## Dashboard WebSocket (Read-Only)

### `ws://host:3000/api/ws`

Read-only stream of enriched detection results. This is the endpoint the dashboard connects to automatically. You can also connect to it directly to build custom alerting integrations.

**Connect:**

```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws');

ws.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    if (event.type === 'connected') return; // initial handshake
    console.log(`${event.verdict} | ${event.source_ip} | ${event.mitre_tactic}`);
};
```

**Initial message on connection:**

```json
{ "type": "connected", "ts": 1716912345678 }
```

**Event message format:**

```json
{
  "id":           "550e8400-e29b-41d4-a716-446655440000",
  "timestamp":    "2024-05-28T15:30:00Z",
  "source_ip":    "185.220.101.47",
  "event_type":   "http_request",
  "severity":     "critical",
  "mitre_tactic": "TA0001",
  "verdict":      "MALICIOUS",
  "file_hash":    "d41d8cd98f00b204e9800998ecf8427e",
  "vt_malicious": 12,
  "abuse_score":  87,
  "clamav_sig":   null
}
```

**Heartbeat:**

The server sends a WebSocket `ping` every 30 seconds. Clients must respond with `pong` (standard WebSocket behavior). Connections that don't respond to 2 consecutive pings are terminated.

---

## Code Examples

### Bulk event ingest (Node.js)

```javascript
const ws = new WebSocket('ws://localhost:4000/ws/events');
const events = loadEventsFromSIEM(); // your data source

ws.onopen = async () => {
    for (const event of events) {
        ws.send(JSON.stringify(event));
        // Optional: await ack before sending next
    }
};
```

### Python security agent integration

```python
import requests, socket, hashlib

def scan_file(filepath: str, source_ip: str):
    with open(filepath, 'rb') as f:
        content = f.read()

    md5 = hashlib.md5(content).hexdigest()

    response = requests.post('http://localhost:4000/events', json={
        "source_ip":  source_ip,
        "event_type": "file_upload",
        "severity":   "medium",
        "file_hash":  md5,
        "payload": {
            "filename": filepath,
            "size_bytes": len(content)
        }
    })
    return response.json()
```

### Subscribe to verdicts (Python)

```python
import asyncio, websockets, json

async def monitor_threats():
    async with websockets.connect('ws://localhost:3000/api/ws') as ws:
        async for message in ws:
            event = json.loads(message)
            if event.get('type') == 'connected':
                continue
            if event['verdict'] == 'MALICIOUS':
                print(f"🚨 MALICIOUS: {event['source_ip']} | {event['mitre_tactic']}")
                # trigger your alerting system here

asyncio.run(monitor_threats())
```
