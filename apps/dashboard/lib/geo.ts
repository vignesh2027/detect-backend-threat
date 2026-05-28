// Lightweight IP → lat/lng lookup using a static CIDR table for demo purposes.
// In production, replace with MaxMind GeoLite2 or ip-api.com.

interface GeoEntry { lat: number; lng: number; country: string }

// Sample static mappings for common regions (augment with real data in prod).
const STATIC_GEO: Record<string, GeoEntry> = {
  "1.1.1.1":        { lat: -33.8688, lng: 151.2093, country: "AU" },
  "8.8.8.8":        { lat: 37.4056,  lng: -122.0775, country: "US" },
  "104.21.0.0":     { lat: 37.7749,  lng: -122.4194, country: "US" },
  "185.220.0.0":    { lat: 52.5200,  lng: 13.4050,  country: "DE" },
  "45.33.32.156":   { lat: 39.0481,  lng: -77.4728, country: "US" },
  default:          { lat:  0,        lng: 0,          country: "XX" },
};

/** Returns a best-effort geo location for an IP. Falls back to a seeded random position. */
export function geoForIP(ip: string): GeoEntry {
  if (STATIC_GEO[ip]) return STATIC_GEO[ip];
  // Seed deterministic lat/lng from IP octets for visual variety
  const parts = ip.split(".").map(Number);
  const lat = ((parts[0] ?? 0) * 1.4 - 90 + (parts[2] ?? 0) * 0.1) % 90;
  const lng = ((parts[1] ?? 0) * 2.8 - 180 + (parts[3] ?? 0) * 0.5) % 180;
  return { lat, lng, country: "XX" };
}

/** Convert lat/lng to XYZ on a unit sphere. */
export function latLngToXYZ(lat: number, lng: number, radius = 1): [number, number, number] {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return [
    -(radius * Math.sin(phi) * Math.cos(theta)),
     (radius * Math.cos(phi)),
     (radius * Math.sin(phi) * Math.sin(theta)),
  ];
}
