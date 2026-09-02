import { useMemo, useState } from "react";
import { ChevronRight, CircleHelp, Filter, Search } from "lucide-react";
import type { CampaignNode } from "@shared/types";
import { money, pct, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { EmptyState, Panel } from "@/components/widgets";

interface ExpoGroup {
  expo: string;
  rows: CampaignNode[];
  spend: number;
  leads: number;
}

export default function LeadsExplorer() {
  const { snapshot, openCreative } = useDashboardContext();
  const [selectedExpo, setSelectedExpo] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyLeads, setOnlyLeads] = useState(false);

  const groups = useMemo<ExpoGroup[]>(() => {
    if (!snapshot) return [];
    const map = new Map<string, CampaignNode[]>();
    for (const c of snapshot.campaigns) {
      const list = map.get(c.expo) ?? [];
      list.push(c);
      map.set(c.expo, list);
    }
    return [...map.entries()]
      .map(([expo, rows]) => ({
        expo,
        rows: [...rows].sort((a, b) => b.metrics.spend - a.metrics.spend),
        spend: rows.reduce((s, r) => s + r.metrics.spend, 0),
        leads: rows.reduce((s, r) => s + r.metrics.leads, 0),
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [snapshot]);

  if (!snapshot) return null;
  const active = groups.find((g) => g.expo === selectedExpo) ?? groups[0];
  const visible = (active?.rows ?? []).filter(
    (c) => (!query || c.name.toLowerCase().includes(query.toLowerCase()) || c.originalName.toLowerCase().includes(query.toLowerCase())) && (!onlyLeads || c.metrics.leads > 0),
  );
  const maxGroupSpend = Math.max(...groups.map((g) => g.spend), 1);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker" style={{ color: "var(--accent)" }}>
            LEAD FUNNEL EXPLORER
          </span>
          <h1>Expo'dan kreativgacha</h1>
          <p>Har bir lead qaysi Expo → kampaniya → ad set → kreativ zanjiridan kelganini bosqichma-bosqich kuzating. Kampaniyani yoyish uchun bosing.</p>
        </div>
        <div className="right">
          <span className="chip accent">
            EXPO <ChevronRight size={11} /> CAMPAIGN <ChevronRight size={11} /> AD SET <ChevronRight size={11} /> CREATIVE
          </span>
        </div>
      </div>

      {/* Expo guruhlari */}
      <div className="grid-12" style={{ marginBottom: 14 }}>
        {groups.map((g, i) => {
          const isActive = active?.expo === g.expo;
          return (
            <div className="col-3" key={g.expo}>
              <button
                className={`creative-card ${isActive ? "sel" : ""}`}
                style={isActive ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}
                onClick={() => {
                  setSelectedExpo(g.expo);
                  setExpanded(null);
                }}
              >
                <div className="c-top">
                  <span className="rank-badge" style={{ background: isActive ? "linear-gradient(135deg, var(--accent), var(--violet))" : "color-mix(in srgb, var(--accent) 38%, transparent)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="c-name">
                    <b>{g.expo}</b>
                    <small>
                      {g.rows.length} kampaniya · CPL {g.leads ? money(g.spend / g.leads) : "N/A"}
                    </small>
                  </div>
                </div>
                <div className="share-bar" style={{ width: "100%", marginLeft: 0 }}>
                  <i style={{ width: `${Math.max((g.spend / maxGroupSpend) * 100, 3)}%` }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                  <span>
                    <b className="mono" style={{ fontSize: 14 }}>
                      {money(g.spend)}
                    </b>
                    <small style={{ display: "block", color: "var(--text-3)", fontSize: 9.5, fontFamily: "var(--mono)", letterSpacing: "0.08em" }}>SPEND</small>
                  </span>
                  <span>
                    <b className="mono" style={{ fontSize: 14, color: "var(--cyan)" }}>
                      {whole(g.leads)}
                    </b>
                    <small style={{ display: "block", color: "var(--text-3)", fontSize: 9.5, fontFamily: "var(--mono)", letterSpacing: "0.08em" }}>LEADS</small>
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      <Panel
        kicker="TANLANGAN EXPO"
        title={active?.expo}
        sub={`${active?.rows.length ?? 0} kampaniya · ${whole(active?.leads ?? 0)} leads · ${money(active?.spend ?? 0)} spend`}
        action={
          <div className="toolbar">
            <label className="search-box" style={{ minHeight: 34, height: 34 }}>
              <Search size={13} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kampaniya qidirish…" />
            </label>
            <button className={`tf-btn ${onlyLeads ? "on" : ""}`} style={{ height: 34 }} onClick={() => setOnlyLeads((v) => !v)}>
              <Filter size={13} /> Faqat leads bor
            </button>
          </div>
        }
      >
        {visible.length === 0 && <EmptyState text="Bu filtr bo'yicha kampaniya yo'q" />}
        {visible.map((c) => {
          const open = expanded === c.id;
          return (
            <div className={`hier-item ${open ? "open" : ""}`} key={c.id} style={{ marginBottom: 9 }}>
              <button
                className="hier-campaign"
                onClick={() => {
                  setExpanded(open ? null : c.id);
                }}
              >
                <span className="chev">
                  <ChevronRight size={13} />
                </span>
                <span className="h-main">
                  <b>{c.name}</b>
                  <small>
                    {c.originalName} · ID {c.id}
                  </small>
                </span>
                <span className="hier-metrics">
                  <span>
                    {money(c.metrics.spend)}
                    <small>Spend</small>
                  </span>
                  <span>
                    {whole(c.metrics.impressions)}
                    <small>Impr.</small>
                  </span>
                  <span style={{ color: c.metrics.leads > 0 ? "var(--cyan)" : "var(--text-3)" }}>
                    {c.metrics.leads > 0 ? whole(c.metrics.leads) : "—"}
                    <small>Leads</small>
                  </span>
                  <span>
                    {c.metrics.cpl != null ? money(c.metrics.cpl) : "N/A"}
                    <small>CPL</small>
                  </span>
                  <span>
                    {pct(c.metrics.ctr)}
                    <small>CTR</small>
                  </span>
                </span>
              </button>
              {open && (
                <div className="hier-expanded">
                  <div className="hier-ctx">
                    <span>
                      AD SET
                      <b>{c.creatives[0]?.adset?.name ?? "Data not available"}</b>
                    </span>
                    <span>
                      OBJECTIVE
                      <b>{c.objective ? String(c.objective).replace(/_/g, " ") : "Data not available"}</b>
                    </span>
                    <span>
                      NATIJA
                      <b>{c.metrics.leads > 0 ? `${whole(c.metrics.leads)} leads · ${money(c.metrics.cpl)} CPL` : "Lead qaytmadi"}</b>
                    </span>
                    <span>
                      AUDITORIYA CHARCHASHI
                      <b style={{ color: (c.metrics.frequency ?? 0) >= 3 ? "var(--warn)" : "var(--text-2)" }}>{c.metrics.frequency != null ? `${c.metrics.frequency.toFixed(2)}×` : "N/A"}</b>
                    </span>
                  </div>
                  {c.creatives.length ? (
                    c.creatives.map((cr, i) => (
                      <button className="cmdk-item" style={{ borderRadius: 10 }} key={`${cr.id}-${i}`} onClick={() => openCreative(cr.id)}>
                        <span className="rank-badge" style={{ width: 22, height: 22, borderRadius: 7, fontSize: 10, background: `color-mix(in srgb, var(--accent) ${Math.max(90 - i * 12, 30)}%, transparent)` }}>
                          {i + 1}
                        </span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <b style={{ display: "block", fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cr.originalName}</b>
                          <small style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-3)" }}>{cr.adset?.originalName ?? "—"}</small>
                        </span>
                        <span className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>
                          {money(cr.metrics.spend)}
                        </span>
                        <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                          {pct(cr.metrics.ctr)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="empty-state" style={{ padding: "18px 8px" }}>
                      <CircleHelp size={16} />
                      Bu kampaniyaga ad-level insight qaytmadi.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Panel>
    </>
  );
}
