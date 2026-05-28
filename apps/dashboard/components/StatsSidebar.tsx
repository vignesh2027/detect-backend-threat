"use client";
import type { ThreatEvent } from "@/lib/types";
import { SEVERITY_COLOR } from "@/lib/types";

interface Props {
  events:        ThreatEvent[];
  eventsPerSec:  number;
  activeThreats: number;
  topCountry:    string;
  selectedEvent: ThreatEvent | null;
  onClose:       () => void;
}

export default function StatsSidebar({
  events,
  eventsPerSec,
  activeThreats,
  topCountry,
  selectedEvent,
  onClose,
}: Props) {
  // Severity breakdown
  const counts = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const e of events.slice(0, 1000)) counts[e.severity]++;
  const total = Math.max(1, events.slice(0, 1000).length);

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      height:        "100%",
      overflow:      "hidden",
      background:    "var(--bg-surface)",
      borderLeft:    "1px solid var(--border)",
    }}>
      {/* Real-time stats */}
      <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{
          fontFamily:  "var(--font-ui)",
          fontSize:    "11px",
          color:       "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "12px",
        }}>Live Stats</div>

        <Metric label="Events/sec"       value={eventsPerSec.toString()} accent />
        <Metric label="Active Threats"   value={activeThreats.toString()} warn={activeThreats > 10} />
        <Metric label="Top Origin"       value={topCountry} />
        <Metric label="Total Ingested"   value={events.length.toLocaleString()} />
      </div>

      {/* Severity breakdown */}
      <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{
          fontFamily:    "var(--font-ui)",
          fontSize:      "11px",
          color:         "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom:  "12px",
        }}>Severity (last 1k)</div>

        {(["critical", "high", "medium", "low"] as const).map((s) => (
          <div key={s} style={{ marginBottom: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: SEVERITY_COLOR[s], textTransform: "uppercase" }}>{s}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)" }}>{counts[s]}</span>
            </div>
            <div style={{ background: "var(--bg-elevated)", borderRadius: "2px", height: "4px" }}>
              <div style={{
                background:   SEVERITY_COLOR[s],
                height:       "100%",
                width:        `${(counts[s] / total) * 100}%`,
                borderRadius: "2px",
                transition:   "width 0.3s ease",
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Selected event detail */}
      {selectedEvent && (
        <div style={{ padding: "16px", flex: 1, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Event Detail
            </div>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px" }}
            >×</button>
          </div>

          {[
            ["ID",         selectedEvent.id],
            ["Timestamp",  new Date(selectedEvent.timestamp).toISOString()],
            ["Source IP",  selectedEvent.source_ip],
            ["Event Type", selectedEvent.event_type],
            ["Severity",   selectedEvent.severity],
            ["Tactic",     selectedEvent.mitre_tactic],
            ["Verdict",    selectedEvent.verdict],
            ["File Hash",  selectedEvent.file_hash ?? "—"],
          ].map(([label, value]) => (
            <div key={label} style={{ marginBottom: "10px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", marginBottom: "2px" }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-primary)", wordBreak: "break-all" }}>{value}</div>
            </div>
          ))}

          {selectedEvent.payload && Object.keys(selectedEvent.payload).length > 0 && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", marginBottom: "6px" }}>Payload</div>
              <pre style={{
                background:  "var(--bg-elevated)",
                border:      "1px solid var(--border)",
                borderRadius:"var(--radius-sm)",
                padding:     "8px",
                fontFamily:  "var(--font-mono)",
                fontSize:    "11px",
                color:       "var(--text-secondary)",
                overflow:    "auto",
                maxHeight:   "200px",
                whiteSpace:  "pre-wrap",
                wordBreak:   "break-all",
              }}>
                {JSON.stringify(selectedEvent.payload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>{label}</span>
      <span style={{
        fontFamily: "var(--font-mono)",
        fontSize:   "16px",
        fontWeight: 600,
        color: accent ? "var(--accent)" : warn ? "var(--sev-high)" : "var(--text-primary)",
      }}>{value}</span>
    </div>
  );
}
