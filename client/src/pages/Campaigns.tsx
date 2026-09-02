import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Download, Filter, Search } from "lucide-react";
import type { CampaignNode } from "@shared/types";
import { money, pct, ratio, whole, downloadCsv } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { EmptyState, SpendShare } from "@/components/widgets";

type SortKey = "spend" | "leads" | "cpl" | "ctr" | "cpm" | "frequency" | "impressions";

const SORTERS: Record<SortKey, (a: CampaignNode, b: CampaignNode) => number> = {
  spend: (a, b) => b.metrics.spend - a.metrics.spend,
  leads: (a, b) => b.metrics.leads - a.metrics.leads,
  cpl: (a, b) => (a.metrics.cpl ?? Infinity) - (b.metrics.cpl ?? Infinity),
  ctr: (a, b) => (b.metrics.ctr ?? 0) - (a.metrics.ctr ?? 0),
  cpm: (a, b) => (b.metrics.cpm ?? 0) - (a.metrics.cpm ?? 0),
  frequency: (a, b) => (b.metrics.frequency ?? 0) - (a.metrics.frequency ?? 0),
  impressions: (a, b) => b.metrics.impressions - a.metrics.impressions,
};

const COLS: { key: SortKey | "name"; label: string }[] = [
  { key: "name", label: "Kampaniya" },
  { key: "spend", label: "Spend" },
  { key: "impressions", label: "Impressions" },
  { key: "leads", label: "Leads" },
  { key: "cpl", label: "CPL" },
  { key: "ctr", label: "CTR" },
  { key: "cpm", label: "CPM" },
  { key: "frequency", label: "Freq" },
];

export default function Campaigns() {
  const { snapshot, openCampaign } = useDashboardContext();
  const [location] = useLocation();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("spend");
  const [onlyLeads, setOnlyLeads] = useState(false);
  const [expo, setExpo] = useState("all");

  const focus = useMemo(() => new URLSearchParams(location.split("?")[1] || "").get("focus"), [location]);
  useEffect(() => {
    if (focus && snapshot) {
      openCampaign(focus);
    }
  }, [focus, snapshot, openCampaign]);

  if (!snapshot) return null;

  const expos = ["all", ...Array.from(new Set(snapshot.campaigns.map((c) => c.expo)))];
  const rows = snapshot.campaigns
    .filter((c) => (onlyLeads ? c.metrics.leads > 0 : true))
    .filter((c) => (expo === "all" ? true : c.expo === expo))
    .filter((c) => {
      const q = search.toLowerCase();
      return !q || c.name.toLowerCase().includes(q) || c.originalName.toLowerCase().includes(q) || c.id.includes(q);
    })
    .sort(SORTERS[sort]);

  const maxSpend = Math.max(...snapshot.campaigns.map((c) => c.metrics.spend), 1);
  const totals = rows.reduce(
    (acc, c) => ({ spend: acc.spend + c.metrics.spend, leads: acc.leads + c.metrics.leads, impressions: acc.impressions + c.metrics.impressions }),
    { spend: 0, leads: 0, impressions: 0 },
  );

  const exportCsv = () => {
    downloadCsv(`sof-expo-campaigns-${snapshot.meta.period.label.replace(/\s/g, "")}.csv`, [
      ["Campaign ID", "Original name", "Canonical name", "Expo", "Spend", "Impressions", "Clicks", "Link clicks", "Leads", "CPL", "CTR %", "CPM", "Frequency"],
      ...rows.map((c) => [
        c.id,
        c.originalName,
        c.name,
        c.expo,
        c.metrics.spend.toFixed(2),
        c.metrics.impressions,
        c.metrics.clicks,
        c.metrics.linkClicks,
        c.metrics.leads,
        c.metrics.cpl?.toFixed(2) ?? "N/A",
        c.metrics.ctr?.toFixed(3) ?? "N/A",
        c.metrics.cpm?.toFixed(2) ?? "N/A",
        c.metrics.frequency?.toFixed(2) ?? "N/A",
      ]),
    ]);
  };

  const cplTone = (v: number | null) => {
    if (v == null) return "tone-muted";
    const avg = snapshot.totals.cpl ?? Infinity;
    return v <= avg ? "tone-good" : v <= avg * 1.5 ? "tone-warn" : "tone-risk";
  };

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker" style={{ color: "var(--accent)" }}>
            KAMPANIYA LEDGER
          </span>
          <h1>Kampaniyalar</h1>
          <p>
            {rows.length} ta kampaniya · {money(totals.spend)} spend · {whole(totals.leads)} leads · {whole(totals.impressions)} impressions. Qatorni bosing — to'liq tafsilot ochiladi.
          </p>
        </div>
        <div className="right">
          <button className="tf-btn" onClick={exportCsv}>
            <Download size={13} /> CSV eksport
          </button>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 13 }}>
        <label className="search-box">
          <Search size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom yoki ID bo'yicha qidirish…" />
        </label>
        <select className="select-btn" value={expo} onChange={(e) => setExpo(e.target.value)}>
          {expos.map((x) => (
            <option key={x} value={x}>
              {x === "all" ? "Barcha Expo'lar" : x}
            </option>
          ))}
        </select>
        <select className="select-btn" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="spend">Tartib: Spend</option>
          <option value="leads">Tartib: Leads</option>
          <option value="cpl">Tartib: CPL (arzon)</option>
          <option value="ctr">Tartib: CTR</option>
          <option value="cpm">Tartib: CPM</option>
          <option value="frequency">Tartib: Frequency</option>
          <option value="impressions">Tartib: Impressions</option>
        </select>
        <button className={`tf-btn ${onlyLeads ? "on" : ""}`} onClick={() => setOnlyLeads((v) => !v)}>
          <Filter size={13} /> Faqat lead berganlar
        </button>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {COLS.map((col) => (
                <th
                  key={col.key}
                  className={col.key === "name" ? "" : "sortable"}
                  onClick={() => col.key !== "name" && setSort(col.key as SortKey)}
                >
                  {col.label}
                  {sort === col.key && " ↓"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={c.id} onClick={() => openCampaign(c.id)}>
                <td>
                  <div className="cell-name">
                    <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                    <span className="n">
                      <b>{c.name}</b>
                      <small>
                        {c.originalName} · {c.expo} · ID {c.id}
                      </small>
                    </span>
                    <SpendShare share={c.metrics.spend / maxSpend} />
                  </div>
                </td>
                <td className="num">{money(c.metrics.spend)}</td>
                <td className="num">{whole(c.metrics.impressions)}</td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {c.metrics.leads > 0 ? whole(c.metrics.leads) : <span className="tone-muted">—</span>}
                </td>
                <td className={`num ${cplTone(c.metrics.cpl)}`}>{c.metrics.cpl != null ? money(c.metrics.cpl) : "N/A"}</td>
                <td className="num">{pct(c.metrics.ctr)}</td>
                <td className="num">{money(c.metrics.cpm)}</td>
                <td className={`num ${(c.metrics.frequency ?? 0) >= 3 ? "tone-warn" : ""}`}>{ratio(c.metrics.frequency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState text="Filtrga mos kampaniya topilmadi" />}
      </div>

      <div className="note-strip" style={{ marginTop: 13 }}>
        <span className="kicker" style={{ flex: "none" }}>
          METODIKA
        </span>
        <span>
          CPL = Spend / Leads (lead action qaytmagan kampaniyalarda N/A). Spend ulushi (o'ng chiziq) — jadvaldagi eng katta sarfga nisbatan. Frequency ≥ 3× bo'yalgan — auditoriya charchash belgisi.
        </span>
      </div>
    </>
  );
}
