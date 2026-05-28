"use client";
import { useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import type { ThreatEvent } from "@/lib/types";
import { geoForIP } from "@/lib/geo";

const MAX_EVENTS = 50_000;

// ── Shared singleton store (outside React lifecycle) ──────────────────────────

type Listener = () => void;

interface StreamStore {
  events:    ThreatEvent[];
  eventsPerSec: number;
  activeThreats: number;
  topCountry: string;
  subscribe:  (l: Listener) => () => void;
  getSnapshot: () => ThreatEvent[];
  getStats:   () => { eventsPerSec: number; activeThreats: number; topCountry: string };
}

function createStore(): StreamStore {
  let events: ThreatEvent[] = [];
  let eventsPerSec = 0;
  let activeThreats = 0;
  let topCountry = "—";
  const listeners = new Set<Listener>();
  const recentTimestamps: number[] = [];

  function notify() { listeners.forEach((l) => l()); }

  function push(event: ThreatEvent) {
    const geo = geoForIP(event.source_ip);
    const enriched: ThreatEvent = {
      ...event,
      source_lat: geo.lat,
      source_lng: geo.lng,
      // target = a plausible defense node (fixed HQ-style coords for demo)
      target_lat: 37.7749,
      target_lng: -122.4194,
    };

    events = [enriched, ...events].slice(0, MAX_EVENTS);

    // Rolling 5s events/sec
    const now = Date.now();
    recentTimestamps.push(now);
    const cutoff = now - 5_000;
    let i = 0;
    while (i < recentTimestamps.length && recentTimestamps[i] < cutoff) i++;
    recentTimestamps.splice(0, i);
    eventsPerSec = Math.round(recentTimestamps.length / 5);

    // Active threats = critical/high in last 60s
    const since60 = new Date(Date.now() - 60_000).toISOString();
    activeThreats = events.filter(
      (e) => (e.severity === "critical" || e.severity === "high") && e.timestamp >= since60
    ).length;

    // Top country (source_ip first octet as proxy)
    const countryCounts: Record<string, number> = {};
    for (const e of events.slice(0, 500)) {
      const geo2 = geoForIP(e.source_ip);
      countryCounts[geo2.country] = (countryCounts[geo2.country] ?? 0) + 1;
    }
    topCountry = Object.entries(countryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    notify();
  }

  return {
    get events()       { return events; },
    get eventsPerSec() { return eventsPerSec; },
    get activeThreats(){ return activeThreats; },
    get topCountry()   { return topCountry; },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    getSnapshot() { return events; },
    getStats() { return { eventsPerSec, activeThreats, topCountry }; },
    // expose push for WS handler
    // @ts-expect-error — intentional internal access
    _push: push,
  };
}

export const eventStore = createStore();

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useEventStream() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
    wsRef.current = ws;

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data as string) as ThreatEvent;
        // @ts-expect-error — internal store push
        (eventStore as { _push: (e: ThreatEvent) => void })._push(event);
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      reconnectRef.current = setTimeout(connect, 2_000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      reconnectRef.current && clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const events = useSyncExternalStore(
    eventStore.subscribe.bind(eventStore),
    eventStore.getSnapshot.bind(eventStore),
    () => [] as ThreatEvent[]
  );

  const stats = useSyncExternalStore(
    eventStore.subscribe.bind(eventStore),
    eventStore.getStats.bind(eventStore),
    () => ({ eventsPerSec: 0, activeThreats: 0, topCountry: "—" })
  );

  return { events, ...stats };
}
