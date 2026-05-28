export type Severity = "low" | "medium" | "high" | "critical";
export type Verdict  = "CLEAN" | "SUSPICIOUS" | "MALICIOUS";

export interface ThreatEvent {
  id:           string;
  timestamp:    string;
  source_ip:    string;
  event_type:   string;
  severity:     Severity;
  mitre_tactic: string;
  verdict:      Verdict;
  file_hash?:   string;
  payload?:     Record<string, unknown>;
  // Geo enrichment (optional, resolved client-side or by enrichment service)
  source_lat?:  number;
  source_lng?:  number;
  target_lat?:  number;
  target_lng?:  number;
}

export interface GraphNode {
  id:          string;
  label:       string;
  eventCount:  number;
  threatScore: number; // 0–100
  x?:          number;
  y?:          number;
  fx?:         number | null;
  fy?:         number | null;
}

export interface GraphEdge {
  source:          string | GraphNode;
  target:          string | GraphNode;
  connectionCount: number;
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  low:      "#00ff88",
  medium:   "#fbbf24",
  high:     "#ff6b35",
  critical: "#ff3366",
};
