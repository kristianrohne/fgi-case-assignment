import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Entity, Finding, FindingStatus, Severity } from "../types";
import { Card, SeverityBadge, StatusBadge } from "./ui";

const SEVERITIES: Severity[] = ["Critical", "Warning", "Info"];
const STATUSES: FindingStatus[] = ["open", "acknowledged", "assigned", "resolved"];

const TEAM_MEMBERS = [
  { name: "Legal Team", email: "legal@nbim.no" },
  { name: "Compliance", email: "compliance@nbim.no" },
  { name: "Portfolio Management", email: "portfolio@nbim.no" },
  { name: "Risk & Governance", email: "risk@nbim.no" },
];

// Jurisdiction → region. The fund is structured in Europe / Americas / Asia-
// Pacific branches; the data has no region column, so we derive it here.
const REGION: Record<string, string> = {
  Netherlands: "Europe", Germany: "Europe", France: "Europe", Ireland: "Europe",
  Luxembourg: "Europe", Spain: "Europe", Denmark: "Europe", Sweden: "Europe",
  Switzerland: "Europe", Norway: "Europe", "United Kingdom": "Europe",
  "USA (Delaware)": "North America", Canada: "North America", Brazil: "South America",
  Singapore: "Asia-Pacific", Japan: "Asia-Pacific", "South Korea": "Asia-Pacific",
  Australia: "Asia-Pacific",
};

// Anything not in the map (e.g. the fabricated "Noveria", or a typo'd country)
// is quarantined here rather than mixed in with real geography — mirroring the
// fictional_jurisdiction detector that already flags it.
const UNRECOGNISED = "Unrecognised";
const regionOf = (j: string | null | undefined): string => (j && REGION[j]) || UNRECOGNISED;

// Style for a multi-select filter chip (region / country): filled when selected.
const selectChip = (on: boolean) =>
  `rounded border px-2.5 py-1 text-xs font-medium transition ${
    on
      ? "border-blue-300 bg-blue-100 text-blue-800"
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;

type EntityMeta = { name: string; jurisdiction: string; region: string };

export function FindingsView({
  findings,
  onStatusChange,
}: {
  findings: Finding[];
  onStatusChange: (id: string, patch: Partial<Finding>) => void;
}) {
  const [severity, setSeverity] = useState<Severity | "All">("All");
  const [status, setStatus] = useState<FindingStatus | "All" | "unresolved">("unresolved");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [regions, setRegions] = useState<Set<string>>(new Set());
  const [countries, setCountries] = useState<Set<string>>(new Set());
  const [entityMap, setEntityMap] = useState<Record<string, EntityMeta>>({});

  // Entities carry jurisdiction/region; findings only carry entity ids, so we
  // load the register once and map each finding to its entities' locations.
  useEffect(() => {
    api.entities().then((list) => {
      const m: Record<string, EntityMeta> = {};
      for (const e of list) {
        const j = e.jurisdiction ?? "";
        m[e.entity_id] = { name: e.entity_name ?? "", jurisdiction: j, region: regionOf(j) };
      }
      setEntityMap(m);
    });
  }, []);

  // Findings per category, for the toggle chips.
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of findings) m.set(f.category, (m.get(f.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [findings]);

  // Only offer countries / regions that actually have findings.
  const presentJurisdictions = useMemo(() => {
    const s = new Set<string>();
    for (const f of findings)
      for (const id of f.entity_ids) if (entityMap[id]?.jurisdiction) s.add(entityMap[id].jurisdiction);
    return [...s].sort();
  }, [findings, entityMap]);

  const presentRegions = useMemo(() => {
    const s = new Set<string>();
    for (const f of findings)
      for (const id of f.entity_ids) if (entityMap[id]?.region) s.add(entityMap[id].region);
    return [...s].sort();
  }, [findings, entityMap]);

  // Country chips are scoped to the selected regions (union). No region selected
  // = all countries available.
  const countryOptions = useMemo(
    () =>
      regions.size === 0
        ? presentJurisdictions
        : presentJurisdictions.filter((j) => regions.has(regionOf(j))),
    [presentJurisdictions, regions],
  );

  function toggleRegion(r: string) {
    setRegions((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  // When the selected regions change, drop any selected country that is no
  // longer inside one of them. (Effect, so rapid chip clicks can't clobber.)
  useEffect(() => {
    if (regions.size === 0) return;
    setCountries((prev) => {
      const kept = new Set([...prev].filter((j) => regions.has(regionOf(j))));
      return kept.size === prev.size ? prev : kept;
    });
  }, [regions]);

  function toggleCountry(c: string) {
    setCountries((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function clearLocation() {
    setSearch("");
    setRegions(new Set());
    setCountries(new Set());
  }

  function toggleCategory(c: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  const q = search.trim().toLowerCase();
  const filtered = findings.filter((f) => {
    if (!(severity === "All" || f.severity === severity)) return false;
    if (hidden.has(f.category)) return false;
    if (!(status === "All" || (status === "unresolved" ? f.status !== "resolved" : f.status === status)))
      return false;
    if (regions.size > 0 && !f.entity_ids.some((id) => regions.has(entityMap[id]?.region ?? "")))
      return false;
    if (countries.size > 0 && !f.entity_ids.some((id) => countries.has(entityMap[id]?.jurisdiction ?? "")))
      return false;
    if (q) {
      const hay = [
        f.title,
        f.detail,
        ...f.entity_ids,
        ...f.entity_ids.map((id) => entityMap[id]?.name ?? ""),
        ...f.entity_ids.map((id) => entityMap[id]?.jurisdiction ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const locationFilterActive = search !== "" || regions.size > 0 || countries.size > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={severity}
            options={["All", ...SEVERITIES]}
            onChange={(v) => setSeverity(v as Severity | "All")}
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as FindingStatus | "All" | "unresolved")}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="unresolved">Unresolved</option>
            <option value="All">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
          <span className="ml-auto text-sm text-slate-500">{filtered.length} shown</span>
        </div>

        {/* Search + Clear (Clear resets search, regions and countries). */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entity, name or country…"
            className="w-60 rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          {locationFilterActive && (
            <button
              onClick={clearLocation}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              Clear
            </button>
          )}
        </div>

        {/* Regions — multi-select. Pick several (e.g. Europe + South America). */}
        {presentRegions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-400">Regions:</span>
            {presentRegions.map((r) => (
              <button key={r} onClick={() => toggleRegion(r)} className={selectChip(regions.has(r))}>
                {r}
              </button>
            ))}
          </div>
        )}

        {/* Countries — compact dropdown button, multi-select inside. */}
        {countryOptions.length > 0 && (
          <CountryDropdown
            options={countryOptions}
            selected={countries}
            onToggle={toggleCountry}
          />
        )}

        {/* Clickable theme toggles — click a box to hide/show that category. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-400">Themes:</span>
          {categoryCounts.map(([c, n]) => {
            const off = hidden.has(c);
            return (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                title={off ? "Hidden — click to show" : "Visible — click to hide"}
                className={`rounded border px-2.5 py-1 text-xs font-medium transition ${
                  off
                    ? "border-slate-200 bg-white text-slate-400 line-through"
                    : "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                }`}
              >
                {c} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((f) => (
          <FindingCard key={f.id} finding={f} onStatusChange={onStatusChange} />
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-slate-400">No findings match these filters.</p>
        )}
      </div>
    </div>
  );
}

// Field order for the entity drill-down (the data behind a finding).
const ENTITY_FIELDS: [keyof Entity, string][] = [
  ["entity_name", "Name"],
  ["jurisdiction", "Jurisdiction"],
  ["status", "Status"],
  ["incorporation_date_raw", "Incorporated"],
  ["parent_entity_id", "Parent"],
  ["ownership_pct", "Ownership %"],
  ["board_mandate_expiry", "Mandate expiry"],
  ["annual_filing_due", "Filing due"],
  ["annual_filing_status", "Filing status"],
  ["registered_agent", "Agent"],
  ["asset_description", "Asset"],
];

function FindingCard({
  finding: f,
  onStatusChange,
}: {
  finding: Finding;
  onStatusChange: (id: string, patch: Partial<Finding>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [entities, setEntities] = useState<Entity[] | null>(null);

  async function toggleEvidence() {
    const next = !open;
    setOpen(next);
    if (next && entities === null && f.entity_ids.length > 0) {
      const fetched = await Promise.all(
        f.entity_ids.map((id) => api.entity(id).catch(() => null)),
      );
      setEntities(fetched.filter((e): e is Entity => e !== null));
    }
  }

  async function changeStatus(next: FindingStatus) {
    setSaving(true);
    try {
      await api.setFindingStatus(f.id, { status: next, assignee: f.assignee, note: f.note });
      onStatusChange(f.id, { status: next });
    } finally {
      setSaving(false);
    }
  }

  async function changeAssignee(name: string | null) {
    setSaving(true);
    const nextStatus: FindingStatus = name && f.status === "open" ? "assigned" : f.status;
    try {
      await api.setFindingStatus(f.id, { status: nextStatus, assignee: name, note: f.note });
      onStatusChange(f.id, { status: nextStatus, assignee: name });
    } finally {
      setSaving(false);
    }
  }

  function sendEmail() {
    const member = TEAM_MEMBERS.find((m) => m.name === f.assignee);
    const to = member?.email ?? "";
    const subject = encodeURIComponent(`[FGI Review] ${f.severity}: ${f.title}`);
    const body = encodeURIComponent(
      `Finding: ${f.title}\nSeverity: ${f.severity}\nEntities: ${f.entity_ids.join(", ")}\n\n${f.detail}${f.recommendation ? `\n\nRecommended action:\n${f.recommendation}` : ""}`,
    );
    window.open(`mailto:${to}?subject=${subject}&body=${body}`);
  }

  return (
    <Card className={`p-4 ${f.status === "resolved" ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <SeverityBadge severity={f.severity} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold text-slate-900">{f.title}</h3>
            <span className="shrink-0 text-xs text-slate-400">{f.category}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{f.detail}</p>

          {f.entity_ids.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {f.entity_ids.map((id) => (
                <span
                  key={id}
                  className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600"
                >
                  {id}
                </span>
              ))}
            </div>
          )}

          {f.recommendation && (
            <div className="mt-3 rounded border-l-4 border-l-blue-400 bg-slate-50 px-3 py-2 text-sm">
              <span className="font-semibold text-slate-700">Recommended action: </span>
              <span className="text-slate-600">{f.recommendation}</span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <StatusBadge status={f.status} />

            {/* Assignee dropdown */}
            <select
              value={f.assignee ?? ""}
              disabled={saving}
              onChange={(e) => changeAssignee(e.target.value || null)}
              className={`rounded-md border px-2 py-1 text-xs disabled:opacity-50 ${
                f.assignee
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-slate-300 bg-white text-slate-400"
              }`}
            >
              <option value="">Assign to…</option>
              {TEAM_MEMBERS.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>

            {/* Email button — only shown when someone is assigned */}
            {f.assignee && (
              <button
                onClick={sendEmail}
                title={`Email ${f.assignee}`}
                className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                Email
              </button>
            )}

            <button
              onClick={toggleEvidence}
              className="ml-auto rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              {open ? "Hide data ▴" : "Show data ▾"}
            </button>
            <select
              value={f.status}
              disabled={saving}
              onChange={(e) => changeStatus(e.target.value as FindingStatus)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs capitalize text-slate-600 disabled:opacity-50"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </div>

          {open && (
            <div className="mt-3 space-y-3 rounded bg-slate-50 p-3 text-xs">
              {entities?.map((e) => (
                <div key={e.entity_id}>
                  <div className="mb-1 font-mono font-semibold text-slate-600">{e.entity_id}</div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    {ENTITY_FIELDS.map(([k, label]) => (
                      <div key={k} className="contents">
                        <dt className="text-slate-400">{label}</dt>
                        <dd className="text-slate-700">{formatValue(e[k])}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {Object.keys(f.evidence).length > 0 && (
                <div>
                  <div className="mb-1 font-semibold text-slate-500">Evidence</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-slate-600">
                    {JSON.stringify(f.evidence, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

// Compact country picker — a single pill button that shows the selection count
// and opens a small checkbox list on click. Closes on outside click.
function CountryDropdown({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: Set<string>;
  onToggle: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const label =
    selected.size === 0
      ? "All countries"
      : selected.size === 1
        ? [...selected][0]
        : `${selected.size} countries`;

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <span className="text-xs font-medium text-slate-400">Countries:</span>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-sm transition ${
          selected.size > 0
            ? "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"
            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        {label}
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 16 16" fill="currentColor"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded border border-slate-200 bg-white shadow-md">
          {/* relative wrapper so the gradient sits on top of the list */}
          <div className="relative">
            <div className="country-scroll max-h-64 overflow-y-scroll py-1">
              {options.map((j) => (
                <label
                  key={j}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(j)}
                    onChange={() => onToggle(j)}
                    className="accent-blue-700"
                  />
                  <span className={regionOf(j) === UNRECOGNISED ? "text-amber-700" : "text-slate-700"}>
                    {regionOf(j) === UNRECOGNISED ? `${j} ⚠` : j}
                  </span>
                </label>
              ))}
            </div>
            {/* Bottom fade — signals that the list continues below the fold */}
            <div className="pointer-events-none absolute bottom-0 inset-x-0 h-8 rounded-b-lg bg-gradient-to-t from-white to-transparent" />
          </div>
        </div>
      )}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded border border-slate-300 bg-white p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition ${
            value === opt ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
