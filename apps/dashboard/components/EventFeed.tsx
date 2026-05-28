"use client";
import {
  useState,
  useMemo,
  useRef,
  useCallback,
  type ChangeEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ThreatEvent, Severity } from "@/lib/types";
import { SEVERITY_COLOR } from "@/lib/types";

const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

const MITRE_LABELS: Record<string, string> = {
  TA0001: "Initial Access",
  TA0002: "Execution",
  TA0011: "C2",
  TA0043: "Recon",
};

interface Props {
  events:         ThreatEvent[];
  filterIP?:      string;
  onClearFilter?: () => void;
}

export default function EventFeed({ events, filterIP, onClearFilter }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(new Set());
  const [tacticFilter,   setTacticFilter]   = useState("");
  const [ipQuery,        setIpQuery]        = useState(filterIP ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleIpChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    debounceRef.current && clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setIpQuery(val), 200);
  }, []);

  const toggleSeverity = useCallback((s: Severity) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let list = events;
    if (filterIP) {
      list = list.filter((e) => e.source_ip === filterIP);
    } else if (ipQuery) {
      list = list.filter((e) => e.source_ip.includes(ipQuery));
    }
    if (severityFilter.size > 0) {
      list = list.filter((e) => severityFilter.has(e.severity));
    }
    if (tacticFilter) {
      list = list.filter((e) => e.mitre_tactic === tacticFilter);
    }
    return list;
  }, [events, filterIP, ipQuery, severityFilter, tacticFilter]);

  const virtualizer = useVirtualizer({
    count:         filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize:  () => 40,
    overscan:      20,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Filter bar */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        gap:           "8px",
        padding:       "8px 12px",
        background:    "var(--bg-surface)",
        borderBottom:  "1px solid var(--border)",
        flexShrink:    0,
        flexWrap:      "wrap",
      }}>
        {filterIP && (
          <div style={{
            display:    "flex",
            alignItems: "center",
            gap:        "6px",
            background: "var(--accent-dim)",
            border:     "1px solid var(--accent)",
            borderRadius: "var(--radius-sm)",
            padding:    "2px 8px",
            fontFamily: "var(--font-mono)",
            fontSize:   "12px",
            color:      "var(--accent)",
          }}>
            {filterIP}
            <button
              onClick={onClearFilter}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "14px" }}
            >×</button>
          </div>
        )}

        <input
          placeholder="Filter IP..."
          defaultValue={filterIP ?? ""}
          onChange={handleIpChange}
          style={{
            background:  "var(--bg-elevated)",
            border:      "1px solid var(--border)",
            borderRadius:"var(--radius-sm)",
            color:       "var(--text-primary)",
            fontFamily:  "var(--font-mono)",
            fontSize:    "12px",
            padding:     "4px 8px",
            width:       "140px",
            outline:     "none",
          }}
        />

        {SEVERITIES.map((s) => (
          <button
            key={s}
            onClick={() => toggleSeverity(s)}
            style={{
              border:       `1px solid ${severityFilter.has(s) ? SEVERITY_COLOR[s] : "var(--border)"}`,
              borderRadius: "var(--radius-sm)",
              background:   severityFilter.has(s) ? `${SEVERITY_COLOR[s]}22` : "transparent",
              color:        severityFilter.has(s) ? SEVERITY_COLOR[s] : "var(--text-secondary)",
              fontFamily:   "var(--font-mono)",
              fontSize:     "11px",
              padding:      "3px 8px",
              cursor:       "pointer",
              textTransform:"uppercase",
              letterSpacing:"0.04em",
            }}
          >{s}</button>
        ))}

        <select
          value={tacticFilter}
          onChange={(e) => setTacticFilter(e.target.value)}
          style={{
            background:  "var(--bg-elevated)",
            border:      "1px solid var(--border)",
            borderRadius:"var(--radius-sm)",
            color:       "var(--text-primary)",
            fontFamily:  "var(--font-mono)",
            fontSize:    "12px",
            padding:     "4px 8px",
          }}
        >
          <option value="">All tactics</option>
          {Object.entries(MITRE_LABELS).map(([id, label]) => (
            <option key={id} value={id}>{id} · {label}</option>
          ))}
        </select>

        <span style={{
          marginLeft: "auto",
          fontFamily: "var(--font-mono)",
          fontSize:   "11px",
          color:      "var(--text-muted)",
        }}>
          {filtered.length.toLocaleString()} events
        </span>
      </div>

      {/* Column headers */}
      <div style={{
        display:       "grid",
        gridTemplateColumns: "90px 160px 110px 130px 140px 90px",
        gap:           "0 12px",
        padding:       "6px 12px",
        background:    "var(--bg-elevated)",
        borderBottom:  "1px solid var(--border)",
        fontFamily:    "var(--font-mono)",
        fontSize:      "11px",
        color:         "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        flexShrink:    0,
      }}>
        <span>Severity</span>
        <span>Timestamp</span>
        <span>Tactic</span>
        <span>Source IP</span>
        <span>Event Type</span>
        <span>Verdict</span>
      </div>

      {/* Virtualized rows */}
      <div
        ref={parentRef}
        style={{ flex: 1, overflow: "auto" }}
      >
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
          {virtualizer.getVirtualItems().map((vItem) => {
            const e = filtered[vItem.index]!;
            return (
              <div
                key={vItem.key}
                className="feed-row"
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position:  "absolute",
                  top:       0,
                  left:      0,
                  width:     "100%",
                  transform: `translateY(${vItem.start}px)`,
                  display:   "grid",
                  gridTemplateColumns: "90px 160px 110px 130px 140px 90px",
                  gap:       "0 12px",
                  padding:   "8px 12px",
                  borderBottom: "1px solid var(--border)",
                  alignItems:   "center",
                  fontFamily:   "var(--font-mono)",
                  fontSize:     "12px",
                  background:   vItem.index % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                }}
              >
                <span className={`badge badge-${e.severity}`}>{e.severity}</span>
                <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span className="badge badge-tactic">{e.mitre_tactic}</span>
                <span style={{ color: "var(--text-primary)" }}>{e.source_ip}</span>
                <span style={{ color: "var(--text-secondary)" }}>{e.event_type}</span>
                <span style={{
                  color: e.verdict === "MALICIOUS" ? "var(--sev-critical)"
                       : e.verdict === "SUSPICIOUS" ? "var(--sev-high)"
                       : "var(--sev-low)",
                  fontWeight: 600,
                  fontSize:   "11px",
                }}>{e.verdict}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
