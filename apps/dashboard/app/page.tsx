"use client";
import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import { useEventStream } from "@/hooks/useEventStream";
import StatsSidebar from "@/components/StatsSidebar";
import EventFeed    from "@/components/EventFeed";
import type { ThreatEvent } from "@/lib/types";

// Lazy-load heavy WebGL/D3 components to avoid SSR issues
const Globe       = dynamic(() => import("@/components/Globe"),       { ssr: false, loading: () => <CanvasPlaceholder label="Loading Globe..." /> });
const ThreatGraph = dynamic(() => import("@/components/ThreatGraph"), { ssr: false, loading: () => <CanvasPlaceholder label="Loading Graph..." /> });

function CanvasPlaceholder({ label }: { label: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-surface)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "13px" }}>
      {label}
    </div>
  );
}

export default function SOCDashboard() {
  const { events, eventsPerSec, activeThreats, topCountry } = useEventStream();
  const [selectedEvent, setSelectedEvent]   = useState<ThreatEvent | null>(null);
  const [filterIP,      setFilterIP]        = useState<string | undefined>(undefined);
  const [activeView,    setActiveView]      = useState<"globe" | "graph">("globe");

  const handleSelectEvent = useCallback((e: ThreatEvent) => setSelectedEvent(e), []);
  const handleSelectIP    = useCallback((ip: string) => setFilterIP(ip), []);
  const handleClearFilter = useCallback(() => { setFilterIP(undefined); setSelectedEvent(null); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* ── Top stats bar ── */}
      <header style={{
        display:       "flex",
        alignItems:    "center",
        gap:           "24px",
        padding:       "0 16px",
        height:        "48px",
        background:    "var(--bg-surface)",
        borderBottom:  "1px solid var(--border)",
        flexShrink:    0,
        fontFamily:    "var(--font-mono)",
        fontSize:      "12px",
      }}>
        <span style={{ fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: "14px", color: "var(--accent)", letterSpacing: "-0.02em" }}>
          ◉ detect-backend-threat
        </span>

        <StatChip label="events/sec" value={eventsPerSec} accent />
        <StatChip label="active threats" value={activeThreats} warn={activeThreats > 10} />
        <StatChip label="top origin" value={topCountry} />
        <StatChip label="total" value={events.length} />

        <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          {(["globe", "graph"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              style={{
                padding:       "4px 12px",
                borderRadius:  "var(--radius-sm)",
                border:        `1px solid ${activeView === v ? "var(--accent)" : "var(--border)"}`,
                background:    activeView === v ? "var(--accent-dim)" : "transparent",
                color:         activeView === v ? "var(--accent)" : "var(--text-secondary)",
                fontFamily:    "var(--font-mono)",
                fontSize:      "11px",
                cursor:        "pointer",
                textTransform: "capitalize",
              }}
            >{v}</button>
          ))}
        </div>
      </header>

      {/* ── Main grid ── */}
      <div style={{
        flex:        1,
        display:     "grid",
        gridTemplateColumns: "1fr 320px",
        gridTemplateRows:    "60% 40%",
        overflow:    "hidden",
        minHeight:   0,
      }}>

        {/* Top-left: Globe or Graph */}
        <div style={{ gridRow: 1, gridColumn: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
          {activeView === "globe"
            ? <Globe events={events} onSelectEvent={handleSelectEvent} />
            : <ThreatGraph events={events} onSelectIP={handleSelectIP} />
          }
        </div>

        {/* Top-right: Stats + selected event */}
        <div style={{ gridRow: 1, gridColumn: 2, minHeight: 0, overflow: "hidden" }}>
          <StatsSidebar
            events={events}
            eventsPerSec={eventsPerSec}
            activeThreats={activeThreats}
            topCountry={topCountry}
            selectedEvent={selectedEvent}
            onClose={handleClearFilter}
          />
        </div>

        {/* Bottom: Event feed (full width) */}
        <div style={{ gridRow: 2, gridColumn: "1 / -1", minHeight: 0, overflow: "hidden", borderTop: "1px solid var(--border)" }}>
          <EventFeed
            events={events}
            filterIP={filterIP}
            onClearFilter={handleClearFilter}
          />
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value, accent, warn }: { label: string; value: string | number; accent?: boolean; warn?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
      <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{
        fontSize:   "13px",
        fontWeight: 600,
        color: accent ? "var(--accent)" : warn ? "var(--sev-high)" : "var(--text-primary)",
      }}>{value}</span>
    </div>
  );
}
