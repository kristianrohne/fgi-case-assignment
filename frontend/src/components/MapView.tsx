/**
 * MapView — world map with one bubble per jurisdiction.
 *
 * Bubble size    = √(entity count) × 8  (min 8 px radius)
 * Bubble colour  = dominant asset class in that country
 * Click a bubble → right panel lists every entity in that country
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { api } from "../api";
import type { Entity } from "../types";
import { Spinner, StatusPill } from "./ui";

// ── Geography source (bundled in /public to work offline) ────────────────────
const GEO_URL = "/world-110m.json";

// ── Zoom level to fly to when a country is selected via search ───────────────
// Calibrated per country size so the target is always comfortably visible.
const ZOOM_FOR: Record<string, number> = {
  Luxembourg:       7,
  Singapore:        7,
  Ireland:          5.5,
  Denmark:          5,
  Switzerland:      5.5,
  Netherlands:      5.5,
  "South Korea":    4.5,
  Germany:          4,
  France:           4,
  "United Kingdom": 4,
  Spain:            3.5,
  Sweden:           3.5,
  Norway:           3.5,
  Japan:            3.5,
  "USA (Delaware)": 6,   // zoom into Delaware, not the whole US
  Brazil:           2.5,
  Canada:           2,
  Australia:        2,
};
const DEFAULT_ZOOM_FOR_COUNTRY = 4;

// ── Country centroids for the 18+ jurisdictions in the register ──────────────
const CENTROIDS: Record<string, [number, number]> = {
  Netherlands:      [5.3,   52.1],
  Germany:          [10.5,  51.2],
  France:           [2.2,   46.2],
  Ireland:          [-8.0,  53.4],
  Luxembourg:       [6.1,   49.8],
  Spain:            [-3.7,  40.4],
  Denmark:          [9.5,   56.3],
  Sweden:           [18.6,  60.1],
  Switzerland:      [8.2,   46.8],
  Norway:           [10.5,  60.5],
  "United Kingdom": [-2.5,  54.0],
  "USA (Delaware)": [-75.5, 39.0],
  Canada:           [-96.8, 56.1],
  Brazil:           [-51.9, -14.2],
  Singapore:        [103.8,  1.4],
  Japan:            [138.3, 36.6],
  "South Korea":    [127.8, 36.5],
  Australia:        [134.5, -25.7],
};

// ── ISO 3166-1 numeric → our jurisdiction name ───────────────────────────────
// world-atlas TopoJSON uses numeric country IDs; we map them back to the
// jurisdiction strings used in the entity register so country polygons are
// clickable when they contain entities.
const ISO_TO_JURISDICTION: Record<number, string> = {
  528: "Netherlands",
  276: "Germany",
  250: "France",
  372: "Ireland",
  442: "Luxembourg",
  724: "Spain",
  208: "Denmark",
  752: "Sweden",
  756: "Switzerland",
  578: "Norway",
  826: "United Kingdom",
  840: "USA (Delaware)",
  124: "Canada",
  76:  "Brazil",
  702: "Singapore",
  392: "Japan",
  410: "South Korea",
  36:  "Australia",
};

// ── Asset-class colour palette (same as HierarchyView) ───────────────────────
const ASSET_PALETTE: Record<string, string> = {
  "Real Estate":    "#059669",
  "Infrastructure": "#3b82f6",
  "Private Equity": "#7c3aed",
  "Equity":         "#d97706",
  "Fixed Income":   "#db2777",
  "Cash":           "#16a34a",
};
const MIXED_COLOR = "#64748b"; // slate — more than one dominant class

// ── Per-country data ─────────────────────────────────────────────────────────
interface CountryBubble {
  country: string;
  coords: [number, number];
  entities: Entity[];
  dominantClass: string | null;
  fill: string;
  radius: number;
  rootCount: number;  // entities with no parent_entity_id
}

function dominant(entities: Entity[]): string | null {
  const counts = new Map<string, number>();
  for (const e of entities) {
    if (e.asset_class) counts.set(e.asset_class, (counts.get(e.asset_class) ?? 0) + 1);
  }
  let best: string | null = null;
  let max = 0;
  for (const [cls, n] of counts) {
    if (n > max) { max = n; best = cls; }
  }
  return best;
}

function buildBubbles(entities: Entity[]): CountryBubble[] {
  const byCountry = new Map<string, Entity[]>();
  for (const e of entities) {
    const j = e.jurisdiction;
    if (!j || !CENTROIDS[j]) continue;
    const arr = byCountry.get(j) ?? [];
    arr.push(e);
    byCountry.set(j, arr);
  }

  return [...byCountry.entries()].map(([country, ents]) => {
    const cls = dominant(ents);
    return {
      country,
      coords: CENTROIDS[country],
      entities: ents.sort((a, b) =>
        (a.parent_entity_id ? 1 : 0) - (b.parent_entity_id ? 1 : 0) ||
        (a.entity_id).localeCompare(b.entity_id)
      ),
      dominantClass: cls,
      fill: cls ? (ASSET_PALETTE[cls] ?? MIXED_COLOR) : MIXED_COLOR,
      radius: Math.max(8, Math.sqrt(ents.length) * 8),
      rootCount: ents.filter((e) => !e.parent_entity_id).length,
    };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function FilingDot({ status }: { status: string | null }) {
  if (!status) return null;
  const color =
    status === "Overdue" ? "bg-red-500" :
    status === "Filed"   ? "bg-emerald-500" :
    status === "Pending" ? "bg-amber-400" : "bg-slate-300";
  return (
    <span title={`Filing: ${status}`}
      className={`inline-block h-2 w-2 rounded-full ${color} shrink-0 mt-1`} />
  );
}

type Tab = "dashboard" | "entities" | "structure" | "map" | "inbox" | "letters" | "history" | "ai-review";

// ── Main component ────────────────────────────────────────────────────────────
export function MapView({
  onNavigate,
  onNavigateToEntity,
}: {
  onNavigate: (tab: Tab) => void;
  onNavigateToEntity: (id: string) => void;
}) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ country: string; x: number; y: number } | null>(null);
  // Controlled map position — updating these flies the map to a new location.
  const [mapPosition, setMapPosition] = useState<{ center: [number, number]; zoom: number }>({
    center: [15, 20],
    zoom: 1,
  });
  // mapZoom tracks the live zoom for bubble-radius scaling (updated on every move frame).
  const [mapZoom, setMapZoom] = useState(1);

  // Search
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightRowRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const mapPanelRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    api.entities().then((e) => { setEntities(e); setLoading(false); });
  }, []);

  // Close search dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setSearchOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Scroll highlighted entity row into view when panel opens
  useEffect(() => {
    if (highlightId && highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlightId, selected]);

  // Track fullscreen state via the browser event so the button icon stays in sync
  useEffect(() => {
    function onChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      mapPanelRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  const bubbles = useMemo(() => buildBubbles(entities), [entities]);
  const selectedBubble = selected ? bubbles.find((b) => b.country === selected) ?? null : null;

  // Search results: match by entity name or ID (min 2 chars)
  const searchResults = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (q.length < 2) return [];
    return entities
      .filter(
        (e) =>
          e.entity_id.toLowerCase().includes(q) ||
          (e.entity_name ?? "").toLowerCase().includes(q),
      )
      .slice(0, 7);
  }, [searchQ, entities]);

  function pickSearchResult(entity: Entity) {
    setHighlightId(entity.entity_id);
    setSelected(entity.jurisdiction);       // opens the country panel
    setSearchQ("");
    setSearchOpen(false);
    // Fly the map to the entity's country
    const coords = entity.jurisdiction ? CENTROIDS[entity.jurisdiction] : null;
    if (coords) {
      setMapPosition({
        center: coords,
        zoom: entity.jurisdiction ? (ZOOM_FOR[entity.jurisdiction] ?? DEFAULT_ZOOM_FOR_COUNTRY) : DEFAULT_ZOOM_FOR_COUNTRY,
      });
    }
  }

  function clearSearch() {
    setSearchQ("");
    setHighlightId(null);
    setSelected(null);     // also close the country panel so the map resets cleanly
    setSearchOpen(false);
  }

  if (loading) return <Spinner label="Loading entities…" />;

  return (
    <div className="flex gap-4" style={{ minHeight: 520 }}>

      {/* ── Map panel ──────────────────────────────────────────────────── */}
      <div
        ref={mapPanelRef}
        className={`relative flex-1 rounded border border-slate-200 bg-[#f8fafc] overflow-hidden ${
          isFullscreen ? "flex flex-col" : ""
        }`}
      >
        {/* Legend */}
        <div className="absolute left-3 top-3 z-10 rounded border border-slate-200 bg-white/90 px-3 py-2 text-xs backdrop-blur-sm">
          <div className="mb-1.5 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">
            Asset class
          </div>
          <div className="space-y-1">
            {Object.entries(ASSET_PALETTE).map(([cls, color]) => (
              <div key={cls} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-slate-600">{cls}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: MIXED_COLOR }} />
              <span className="text-slate-600">Mixed / other</span>
            </div>
          </div>
        </div>

        {/* Search box — top right of map */}
        <div ref={searchRef} className="absolute right-3 top-3 z-20 w-64">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={searchQ}
              onChange={(e) => { setSearchQ(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              placeholder={`Search ${entities.length} entities…`}
              className="w-full rounded border border-slate-200 bg-white/95 pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-400 backdrop-blur-sm"
            />
            {(searchQ || highlightId) && (
              <button onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs leading-none">
                ✕
              </button>
            )}
          </div>

          {/* Results dropdown */}
          {searchOpen && searchResults.length > 0 && (
            <div className="mt-1 rounded border border-slate-200 bg-white shadow-md overflow-hidden">
              {searchResults.map((e) => (
                <button
                  key={e.entity_id}
                  onClick={() => pickSearchResult(e)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50 transition-colors"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: e.asset_class ? (ASSET_PALETTE[e.asset_class] ?? MIXED_COLOR) : MIXED_COLOR }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-slate-800 truncate block">
                      {e.entity_name ?? e.entity_id}
                    </span>
                    <span className="text-slate-400">
                      {e.entity_id} · {e.jurisdiction ?? "unknown"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {searchOpen && searchQ.length >= 2 && searchResults.length === 0 && (
            <div className="mt-1 rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400 shadow-sm">
              No entities match "{searchQ}"
            </div>
          )}
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-20 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
          >
            <span className="font-semibold text-slate-800">{tooltip.country}</span>
            <span className="ml-1 text-slate-400">
              {bubbles.find((b) => b.country === tooltip.country)?.entities.length ?? 0} entities
            </span>
          </div>
        )}

        <ComposableMap
          projection="geoNaturalEarth1"
          projectionConfig={{ scale: 155 }}
          width={800}
          height={450}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup
            center={mapPosition.center}
            zoom={mapPosition.zoom}
            minZoom={0.8}
            maxZoom={8}
            // translateExtent keeps the map from being dragged completely off-screen.
            // Values are in SVG pixels (canvas is 800 × 450); this allows panning
            // up to ~half the canvas in any direction before clamping.
            translateExtent={[[-300, -200], [1100, 650]]}
            onMove={({ zoom }: { zoom: number }) => setMapZoom(zoom)}
            onMoveEnd={({ coordinates, zoom }: { coordinates: [number, number]; zoom: number }) => {
              setMapZoom(zoom);
              // Keep controlled position in sync so a subsequent programmatic
              // fly-to doesn't snap back to the last saved position.
              setMapPosition({ center: coordinates, zoom });
            }}
          >
            {/* Ocean colour is set by the svg background (bg-[#f8fafc]) */}
            <Graticule stroke="#e2e8f0" strokeWidth={0.5} />

            {/* Country polygons */}
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const jurisdiction = ISO_TO_JURISDICTION[Number(geo.id)];
                  const hasBubble    = !!jurisdiction && bubbles.some((b) => b.country === jurisdiction);
                  const isActive     = jurisdiction === selected;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      stroke="#fff"
                      strokeWidth={0.4}
                      onClick={hasBubble ? () => setSelected(isActive ? null : jurisdiction) : undefined}
                      style={{
                        default: {
                          fill:    isActive ? "#bfdbfe" : "#e2e8f0",
                          outline: "none",
                          cursor:  hasBubble ? "pointer" : "default",
                        },
                        hover: {
                          fill:    hasBubble ? "#cbd5e1" : "#cbd5e1",
                          outline: "none",
                          cursor:  hasBubble ? "pointer" : "default",
                        },
                        pressed: { outline: "none" },
                      }}
                    />
                  );
                })
              }
            </Geographies>

            {/* Bubbles — radius divided by mapZoom keeps them constant in screen pixels */}
            {bubbles.map((b) => {
              const isSelected = selected === b.country;
              const isHighlighted = highlightId !== null &&
                b.entities.some((e) => e.entity_id === highlightId);
              const r = b.radius / mapZoom;
              return (
                <Marker
                  key={b.country}
                  coordinates={b.coords}
                  onClick={() => setSelected(isSelected ? null : b.country)}
                  onMouseEnter={(e: React.MouseEvent) => {
                    const rect = (e.currentTarget as SVGElement)
                      .closest("svg")!
                      .getBoundingClientRect();
                    const svgX = e.clientX - rect.left;
                    const svgY = e.clientY - rect.top;
                    setTooltip({ country: b.country, x: svgX, y: svgY });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Amber search-highlight ring — pulses behind the bubble */}
                  {isHighlighted && (
                    <circle
                      r={r + 7 / mapZoom}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={2.5 / mapZoom}
                      opacity={0.9}
                    />
                  )}
                  {/* Selection ring */}
                  {isSelected && (
                    <circle
                      r={r + 4 / mapZoom}
                      fill="none"
                      stroke={b.fill}
                      strokeWidth={2 / mapZoom}
                      opacity={0.4}
                    />
                  )}
                  <circle
                    r={r}
                    fill={b.fill}
                    fillOpacity={isSelected || isHighlighted ? 1 : 0.82}
                    stroke={isHighlighted ? "#f59e0b" : "#fff"}
                    strokeWidth={isHighlighted ? 2 / mapZoom : 1.5 / mapZoom}
                  />
                  {/* Count label inside bubble (only if radius big enough) */}
                  {b.entities.length > 1 && r >= 10 && (
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#fff"
                      fontSize={Math.min(r * 0.7, 11 / mapZoom)}
                      fontWeight={600}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {b.entities.length}
                    </text>
                  )}
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>

        {/* Fullscreen overlay panel */}
        {isFullscreen && selectedBubble && (
          <div className="absolute top-4 right-4 bottom-4 z-30 w-80 flex flex-col rounded border border-slate-200 bg-white shadow-xl overflow-hidden">
            <CountryPanel
              bubble={selectedBubble}
              highlightId={highlightId}
              highlightRowRef={highlightRowRef}
              onClose={() => setSelected(null)}
              onNavigate={onNavigate}
              onNavigateToEntity={onNavigateToEntity}
            />
          </div>
        )}

        {/* Bottom-right controls */}
        <div className="absolute bottom-2 right-3 flex items-center gap-2">
          <p className="text-[10px] text-slate-400 select-none">
            Scroll to zoom · drag to pan
          </p>
          <button
            title="Reset view"
            onClick={() => setMapPosition({ center: [15, 20], zoom: 1 })}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-500 shadow-sm hover:bg-white hover:text-slate-800 transition-colors backdrop-blur-sm"
          >
            ⌂ Reset
          </button>
          <button
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
            className="flex items-center gap-1 rounded border border-slate-300 bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-500 shadow-sm hover:bg-white hover:text-slate-800 transition-colors backdrop-blur-sm"
          >
            {isFullscreen ? (
              /* Compress icon */
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 7a1 1 0 011-1h3V3a1 1 0 012 0v4a1 1 0 01-1 1H4a1 1 0 01-1-1zm10 0a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h3V7a1 1 0 011-1zm-9 6a1 1 0 011 1v3h3a1 1 0 010 2H4a1 1 0 01-1-1v-4a1 1 0 011-1zm9 1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h3v-3a1 1 0 011-1z"/>
              </svg>
            ) : (
              /* Expand icon */
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 3h5a1 1 0 010 2H5.41l3.3 3.29a1 1 0 01-1.42 1.42L4 6.41V8a1 1 0 01-2 0V4a1 1 0 011-1zm11 0h1a1 1 0 011 1v4a1 1 0 01-2 0V6.41l-3.3 3.3a1 1 0 01-1.42-1.42L12.59 5H11a1 1 0 010-2zm-9 9a1 1 0 012 0v1.59l3.3-3.3a1 1 0 011.42 1.42L8.41 14H10a1 1 0 010 2H6a1 1 0 01-1-1v-3zm7 3.59l3.3-3.3a1 1 0 011.42 1.42L13.41 17H15a1 1 0 010 2h-4a1 1 0 01-1-1v-4a1 1 0 012 0v1.59z"/>
              </svg>
            )}
            {isFullscreen ? "Exit" : "Fullscreen"}
          </button>
        </div>
      </div>

      {/* ── Side panel (normal mode only) ──────────────────────────────── */}
      {!isFullscreen && (
        selectedBubble ? (
          <aside className="w-80 shrink-0 flex flex-col rounded border border-slate-200 bg-white overflow-hidden">
            <CountryPanel
              bubble={selectedBubble}
              highlightId={highlightId}
              highlightRowRef={highlightRowRef}
              onClose={() => setSelected(null)}
              onNavigate={onNavigate}
              onNavigateToEntity={onNavigateToEntity}
            />
          </aside>
        ) : (
          /* Placeholder when nothing selected */
          <aside className="w-80 shrink-0 flex flex-col items-center justify-center rounded border border-dashed border-slate-200 bg-white text-center px-6 py-8">
            <div className="text-3xl mb-3">🌍</div>
            <div className="text-sm font-medium text-slate-600">Click a bubble</div>
            <div className="mt-1 text-xs text-slate-400">
              Select a country to see all entities in that jurisdiction
            </div>
            <div className="mt-4 w-full space-y-1">
              {[...bubbles]
                .sort((a, b) => b.entities.length - a.entities.length)
                .slice(0, 5)
                .map((b) => (
                  <button
                    key={b.country}
                    onClick={() => setSelected(b.country)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50 transition-colors"
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: b.fill }} />
                    <span className="flex-1 text-left text-slate-700">{b.country}</span>
                    <span className="font-mono text-slate-400">{b.entities.length}</span>
                  </button>
                ))}
              <p className="text-[10px] text-slate-300 pt-1">top 5 by entity count</p>
            </div>
          </aside>
        )
      )}
    </div>
  );
}

// ── Shared country detail panel ───────────────────────────────────────────────
function CountryPanel({
  bubble: b,
  highlightId,
  highlightRowRef,
  onClose,
  onNavigate,
  onNavigateToEntity,
}: {
  bubble: CountryBubble;
  highlightId: string | null;
  highlightRowRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onNavigate: (tab: Tab) => void;
  onNavigateToEntity: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const classCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of b.entities) {
      if (e.asset_class) m.set(e.asset_class, (m.get(e.asset_class) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, x) => x[1] - a[1]);
  }, [b]);

  return (
    <>
      {/* Header */}
      <div
        className="px-4 py-3 flex items-start justify-between gap-2 shrink-0"
        style={{ borderBottom: `3px solid ${b.fill}` }}
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Jurisdiction</div>
          <div className="mt-0.5 text-base font-semibold text-slate-900">{b.country}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
            <span><span className="font-semibold text-slate-700">{b.entities.length}</span>{" "}{b.entities.length === 1 ? "entity" : "entities"}</span>
            {b.rootCount > 0 && <span>· <span className="font-semibold text-slate-700">{b.rootCount}</span> root</span>}
          </div>
        </div>
        <button onClick={onClose} className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-700 text-lg leading-none" title="Close">×</button>
      </div>

      {/* Asset class chips */}
      {classCounts.length > 0 && (
        <div className="px-4 pt-3 pb-2 border-b border-slate-100 shrink-0">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Asset classes</div>
          <div className="flex flex-wrap gap-1.5">
            {classCounts.map(([cls, n]) => (
              <span key={cls} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-white"
                style={{ background: ASSET_PALETTE[cls] ?? MIXED_COLOR }}>
                {cls}<span className="opacity-75">·{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Entity list */}
      <div className="flex-1 overflow-y-auto country-scroll divide-y divide-slate-100 min-h-0">
        {b.entities.map((e) => {
          const isMatch    = e.entity_id === highlightId;
          const isExpanded = e.entity_id === expandedId;
          return (
            <div
              key={e.entity_id}
              ref={isMatch ? highlightRowRef : null}
              className={isMatch ? "border-l-2 border-l-amber-400" : ""}
            >
              {/* Collapsed row — click to expand */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : e.entity_id)}
                className={`w-full text-left px-4 py-2.5 flex items-start gap-2 transition-colors ${
                  isExpanded ? "bg-blue-50" : isMatch ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-slate-50"
                }`}
              >
                <FilingDot status={e.annual_filing_status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="font-mono text-xs text-slate-400">{e.entity_id}</span>
                    <StatusPill status={e.status} />
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-slate-800 leading-snug">
                    {e.entity_name ?? <span className="text-red-400 italic">unnamed</span>}
                  </div>
                  {e.asset_class && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                      style={{ background: ASSET_PALETTE[e.asset_class] ?? MIXED_COLOR }}>
                      {e.asset_class}
                      {e.ownership_pct != null && <span className="opacity-75">· {e.ownership_pct}%</span>}
                    </div>
                  )}
                </div>
                {/* Chevron */}
                <svg className={`h-3.5 w-3.5 shrink-0 mt-1 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 space-y-2">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    {[
                      ["Type",         e.entity_type],
                      ["Parent",       e.parent_entity_id],
                      ["Ownership",    e.ownership_pct != null ? `${e.ownership_pct}%` : null],
                      ["Incorporated", e.incorporation_date ?? e.incorporation_date_raw],
                      ["Filing due",   e.annual_filing_due],
                      ["Filing",       e.annual_filing_status],
                      ["Mandate exp.", e.board_mandate_expiry],
                      ["Agent",        e.registered_agent],
                      ["Address",      e.registered_address],
                    ].map(([label, val]) =>
                      val ? (
                        <div key={label as string} className="contents">
                          <dt className="text-slate-400 self-start pt-0.5 whitespace-nowrap">{label}</dt>
                          <dd className="text-slate-700 break-words">{val}</dd>
                        </div>
                      ) : null
                    )}
                  </dl>
                  {e.asset_description && (
                    <p className="text-xs text-slate-500 italic border-t border-slate-200 pt-2">{e.asset_description}</p>
                  )}
                  {/* Navigate button */}
                  <button
                    onClick={() => onNavigateToEntity(e.entity_id)}
                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    Open in Entities tab
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] text-slate-400 shrink-0">
        <span className="mr-1">🟢</span> Filed{" · "}
        <span className="mr-1">🟡</span> Pending{" · "}
        <span className="mr-1">🔴</span> Overdue · click a row to expand
      </div>
    </>
  );
}
