# ADR-002: Redis Streams over Apache Kafka

**Status**: Accepted  
**Date**: 2024-05

---

## Context

The ingest layer must decouple event producers (HTTP/WS clients) from consumers (detection engine, dashboard WebSocket fan-out). Options evaluated:

| Option | Pros | Cons |
|--------|------|------|
| **Redis Streams** | Already in stack (cache), < 1ms XADD, simple ops | Single-node by default, no built-in schema registry |
| **Apache Kafka** | Durable replay, consumer groups, ecosystem | Separate cluster, ZooKeeper/KRaft overhead, ~5ms p50 |
| **NATS JetStream** | Low latency, lightweight | Less ecosystem tooling, team unfamiliarity |
| **RabbitMQ** | Mature AMQP ecosystem | Higher latency, complex HA setup |

## Decision

Use **Redis Streams** (`XADD threats:stream * payload <json>`).

## Consequences

**Positive**
- Eliminates a separate message broker service — Redis already required for AbuseIPDB cache
- `XREAD BLOCK 0` provides a blocking consumer loop with < 1ms wakeup latency
- Consumer groups (`XREADGROUP`) available for Phase 2 horizontal scaling
- `docker compose` complexity stays at 5 services vs 7+ for Kafka

**Negative**
- No built-in schema evolution — Zod validation at ingest boundary must remain strict
- Redis persistence (`RDB`/`AOF`) disabled for performance (cache workload); stream messages lost on restart unless AOF enabled separately
- Practical limit ~10M entries before memory pressure — add TTL via `XADD MAXLEN ~` trim if needed

**Mitigation for durability**
In production, enable `appendonly yes` on the Redis instance used for Streams (separate from the LRU cache instance) or migrate to Kafka when event volume exceeds 100k/sec sustained.
