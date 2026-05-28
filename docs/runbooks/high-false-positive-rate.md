# Runbook: High False-Positive Rate

**Severity**: SEV-2  
**Owner**: SOC Engineering  
**Last reviewed**: 2024-05

---

## Symptom

Dashboard shows > 20% of events with verdict `SUSPICIOUS` or `MALICIOUS` for IPs/hashes that are known-good. Analysts report alert fatigue.

## Triage Steps

### 1. Identify the signal source

```bash
# Connect to TimescaleDB
psql $DATABASE_URL

-- Which detector is generating false positives?
SELECT
  verdict,
  CASE
    WHEN clamav_sig IS NOT NULL THEN 'clamav'
    WHEN vt_malicious > 0       THEN 'virustotal'
    WHEN abuse_score >= 50      THEN 'abuseipdb'
    ELSE 'unknown'
  END AS source,
  COUNT(*) as count
FROM events
WHERE timestamp > NOW() - INTERVAL '1 hour'
  AND verdict IN ('SUSPICIOUS','MALICIOUS')
GROUP BY 1, 2
ORDER BY 3 DESC;
```

### 2. ClamAV false positives

```bash
# Check signature causing FPs
SELECT clamav_sig, COUNT(*) FROM events
WHERE timestamp > NOW() - INTERVAL '1 hour'
  AND clamav_sig IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;

# If a known-benign signature:
# 1. Submit FP report to ClamAV: https://www.clamav.net/reports/fp
# 2. Add to local whitelist: /var/lib/clamav/local.ign2
#    echo "SHA256:deadbeef..." >> /var/lib/clamav/local.ign2
#    docker exec threat_clamav clamd --reload
```

### 3. AbuseIPDB false positives

AbuseIPDB scores can be inflated for shared hosting or CDN IPs.

```bash
# Check which IPs are scoring high
SELECT source_ip, MAX(abuse_score), COUNT(*) FROM events
WHERE timestamp > NOW() - INTERVAL '1 hour'
  AND abuse_score >= 50
GROUP BY 1 ORDER BY 2 DESC LIMIT 20;

# Remove cached score to force re-check:
redis-cli DEL "abuseipdb:1.2.3.4"

# Raise the AbuseIPDB threshold (in internal/abuseipdb/client.go):
# Change `score >= 50` → `score >= 70` in ScoreToSeverity()
```

### 4. VirusTotal false positives

Low engine count with 1–2 detections is often a heuristic FP.

```bash
-- Hashes with only 1-2 malicious engines
SELECT file_hash, vt_malicious FROM events
WHERE timestamp > NOW() - INTERVAL '1 hour'
  AND vt_malicious BETWEEN 1 AND 2
GROUP BY 1, 2 LIMIT 20;

# Raise threshold: internal/detector/engine.go
# Change: `case r.VTReport.Malicious >= 1:` → `>= 3`
```

### 5. Immediate mitigation

If alert volume is overwhelming analysts:

```bash
# Temporarily raise all thresholds via env var (requires restart)
# ABUSEIPDB_MIN_SCORE=75 VIRUSTOTAL_MIN_ENGINES=5 docker compose restart detector
```

## Escalation

If FP rate > 40% after triage: escalate to detection engineering. Review [ADR-001](../adr/001-go-detection-engine.md) for threshold change process.

## Prevention

- Run weekly FP audit query (above) and track trend in Grafana
- Pin ClamAV signature DB version in production (`clamav/clamav:1.3.1` not `:stable`)
- Enable `dryRun` mode (Phase 3) before deploying threshold changes
