# Threat Intelligence

## MITRE ATT&CK Coverage

The platform maps detected events to MITRE ATT&CK Enterprise v14 tactics and techniques.

[View Navigator Layer](https://mitre-attack.github.io/attack-navigator/#layerURL=https://raw.githubusercontent.com/vignesh2027/detect-backend-threat/main/infra/mitre/layer.json){ .md-button }

### Covered Techniques

| ID | Name | Detection Signal | Tactic |
|----|------|-----------------|--------|
| T1566 | Phishing | AbuseIPDB score ≥50 + HTTP event | Initial Access |
| T1203 | Exploitation for Client Execution | ClamAV signature match | Execution |
| T1059 | Command and Scripting Interpreter | `process_spawn` event type | Execution |
| T1071 | Application Layer Protocol | Network connection to high-abuse IP | C2 |
| T1046 | Network Service Discovery | High-volume DNS query events | Discovery |
| T1190 | Exploit Public-Facing Application | HTTP request + VirusTotal malicious hit | Initial Access |
| T1110 | Brute Force | High-frequency `login_attempt` events | Credential Access |
| T1041 | Exfiltration Over C2 Channel | `file_upload` to known-bad IP | Exfiltration |

### Tactic Codes in Events

| Code | Tactic | Trigger |
|------|--------|---------|
| TA0001 | Initial Access | VirusTotal malicious count > 0 |
| TA0002 | Execution | ClamAV signature found |
| TA0011 | Command and Control | AbuseIPDB score ≥ 50 |
| TA0043 | Reconnaissance | Default (no other signal) |

## IOC Sources

### ClamAV
- **Signature database**: updated via `freshclamd` on container start
- **Protocol**: INSTREAM TCP (port 3310)
- **Coverage**: malware, exploits, phishing documents

### VirusTotal v3
- **Endpoint**: `GET /api/v3/files/{hash}`
- **Aggregation**: multi-engine malicious count threshold (1 → medium, 3 → high, 10 → critical)
- **Rate limits**: handled by the detection engine; add Redis queue in Phase 3 for high volume

### AbuseIPDB v2
- **Endpoint**: `GET /api/v2/check?ipAddress={ip}&maxAgeInDays=90`
- **Caching**: Redis LRU, 50k entries, 1h TTL — reduces API calls by ~90% for repeat IPs
- **Score mapping**: 0–19 low · 20–49 medium · 50–79 high · 80–100 critical

## Adding a Detection Rule

Detection rules are expressed as Go functions in `internal/detector/engine.go`. See [Contributing](contributing.md) for the full guide.

Example — custom severity override based on MITRE tactic:

```go
// In computeSeverity, after existing checks:
if r.Event.MitreTactic == "TA0040" { // Impact
    severity = escalate(severity, SeverityHigh)
}
```
