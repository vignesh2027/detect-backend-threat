# ADR-001: Go for the Detection Engine

**Status**: Accepted  
**Date**: 2024-05

---

## Context

The detection engine must:
- Call three external services (ClamAV, VirusTotal, AbuseIPDB) per event
- Achieve p99 orchestration latency < 50ms
- Run safely under concurrent load from Redis Streams consumers
- Be testable without network access (unit tests)

Languages evaluated: Go, Python (FastAPI), Rust, Node.js.

## Decision

Use **Go** for the detection engine (`cmd/detector/`, `internal/`).

## Consequences

**Positive**
- Goroutine-per-event concurrency model maps directly to "call 3 APIs in parallel, merge results"
- 221 ns/op orchestration overhead — 4,000× under the 50ms budget, leaving headroom for network latency
- No global state requirement — dependency injection is idiomatic; scanners are struct fields
- `go test -race` catches data races at CI time
- Static binary: single `FROM alpine` container layer, no runtime deps

**Negative**
- More verbose than Python for rapid prototyping of new detection rules
- ClamAV TCP protocol required manual framing (INSTREAM 4-byte length prefix) — no official Go client
- Requires `go mod tidy` when adding scanner integrations

**Trade-offs vs Rust**  
Rust would have lower overhead (~50ns) but compile times and unsafe concerns for the Redis/HTTP clients outweigh the 170ns saving at this scale.

**Trade-offs vs Python**  
Python asyncio would work but GIL constraints and 10–50× higher per-call overhead would require horizontal scaling much earlier.
