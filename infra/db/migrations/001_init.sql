-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enums
CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE verdict_type   AS ENUM ('CLEAN', 'SUSPICIOUS', 'MALICIOUS');

-- Core events table
CREATE TABLE IF NOT EXISTS events (
    id            UUID            NOT NULL DEFAULT gen_random_uuid(),
    timestamp     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    source_ip     INET            NOT NULL,
    event_type    TEXT            NOT NULL,
    payload       JSONB           NOT NULL DEFAULT '{}',
    severity      severity_level  NOT NULL DEFAULT 'low',
    mitre_tactic  TEXT,
    verdict       verdict_type    NOT NULL DEFAULT 'CLEAN',
    file_hash     TEXT,
    clamav_sig    TEXT,
    vt_malicious  INT             DEFAULT 0,
    abuse_score   INT             DEFAULT 0,
    created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
);

-- TimescaleDB hypertable partitioned on timestamp
SELECT create_hypertable('events', 'timestamp', if_not_exists => TRUE);

-- 7-day retention policy — chunks older than 7 days are dropped automatically
SELECT add_retention_policy('events', INTERVAL '7 days', if_not_exists => TRUE);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_events_source_ip   ON events (source_ip,    timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_severity    ON events (severity,     timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_mitre       ON events (mitre_tactic, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_created_at  ON events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_verdict     ON events (verdict,      timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_payload_gin ON events USING GIN (payload);

-- Continuous aggregate: per-minute threat counts (rolling 1h refresh)
CREATE MATERIALIZED VIEW IF NOT EXISTS threat_summary_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', timestamp) AS bucket,
    severity,
    verdict,
    COUNT(*)                           AS event_count,
    COUNT(DISTINCT source_ip)          AS unique_ips
FROM events
GROUP BY bucket, severity, verdict
WITH NO DATA;

SELECT add_continuous_aggregate_policy('threat_summary_1m',
    start_offset      => INTERVAL '1 hour',
    end_offset        => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists     => TRUE
);
