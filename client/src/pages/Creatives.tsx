import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { money, pct, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { EmptyState, Panel } from "@/components/widgets";
import { CtrTopChart } from "@/components/charts";

type Rank = "spend" | "ctr" | "clicks";

export default function Creatives() {
  const { snapshot, openCreative } = useDashboardContext();
  const [query, setQuery] = useState("");
  const [rank, setRank] = useState<Rank>("spend");

  const rows = useMemo(() => {
    if (!snapshot) return [];
    const list = snapshot.creatives.filter((c) => {
      const q = query.toLowerCase();
      return !q || c.originalName.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.adset?.originalName ?? "").toLowerCase().includes(q);
    });
    return list.sort((a, b) =>
      rank === "spend" ? b.metrics.spend - a.metrics.spend : rank === "ctr" ? (b.metrics.ctr ?? 0) - (a.metrics.ctr ?? 0) : b.metrics.clicks - a.metrics.clicks,
    );
  }, [snapshot, query, rank]);

  if (!snapshot) return null;

  const campaignName = (id: string) => snapshot.campaigns.find((c) => c.id === id)?.originalName ?? "—";
  const maxSpend = Math.max(...snapshot.creatives.map((c) => c.metrics.spend), 1);

  const topCtrChart = [...snapshot.creatives]
    .sort((a, b) => (b.metrics.ctr ?? 0) - (a.metrics.ctr ?? 0))
    .slice(0, 10)
    .map((c) => ({ name: c.originalName, short: c.originalName.length > 14 ? `${c.originalName.slice(0, 13)}…` : c.originalName, ctr: c.metrics.ctr ?? 0 }));

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker" style={{ color: "var(--accent)" }}>
            KREATIV REYTINGI
          </span>
          <h1>Kreativlar</h1>
          <p>
            {snapshot.creatives.length} ta ad-level kreativ. Ushbu hisobotda ad darajasida lead metrikasi qaytmagan — reyting spend, CTR va clicks orqali. Karta ustiga bosing: to'liq tafsilot.
          </p>
        </div>
        <div className="right">
          <label className="search-box">
            <Search size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kreativ yoki adset qidirish…" />
          </label>
          <select className="select-btn" value={rank} onChange={(e) => setRank(e.target.value as Rank)}>
            <option value="spend">Reyting: Spend</option>
            <option value="ctr">Reyting: CTR</option>
            <option value="clicks">Reyting: Clicks</option>
          </select>
        </div>
      </div>

      <Panel kicker="CTR LIDERLARI" title="Eng kuchli 10 kreativ" sub="Bosilish darajasi — creative g'oyasining auditoriyaga tegishini ko'rsatadi (to'q rang — o'rtachadan yuqori)" style={{ marginBottom: 14 }}>
        <div style={{ height: 280 }}>
          <CtrTopChart data={topCtrChart} avg={snapshot.totals.ctr} />
        </div>
      </Panel>

      {rows.length === 0 ? (
        <EmptyState text="Kreativ topilmadi" />
      ) : (
        <div className="creative-grid">
          {rows.map((c, i) => (
            <button className="creative-card" key={`${c.id}-${i}`} onClick={() => openCreative(c.id)}>
              <div className="c-top">
                <span className="rank-badge" style={{ background: `color-mix(in srgb, var(--accent) ${Math.max(92 - i * 5, 28)}%, transparent)` }}>{String(i + 1).padStart(2, "0")}</span>
                <div className="c-name">
                  <b title={c.originalName}>{c.originalName}</b>
                  <small title={campaignName(c.campaignId)}>
                    {campaignName(c.campaignId)} · {c.adset?.originalName ?? "—"}
                  </small>
                </div>
                <span className={`chip ${c.effectiveStatus === "ACTIVE" ? "good" : "muted"}`} style={{ marginLeft: "auto", flex: "none" }}>
                  {c.effectiveStatus ?? "—"}
                </span>
              </div>
              <div className="c-stats">
                <div>
                  <small>Spend</small>
                  <b>{money(c.metrics.spend)}</b>
                </div>
                <div>
                  <small>Impr.</small>
                  <b>{whole(c.metrics.impressions)}</b>
                </div>
                <div>
                  <small>Clicks</small>
                  <b>{whole(c.metrics.clicks)}</b>
                </div>
                <div>
                  <small>CTR</small>
                  <b style={{ color: (c.metrics.ctr ?? 0) >= (snapshot.totals.ctr ?? 0) ? "var(--good)" : "var(--text)" }}>{pct(c.metrics.ctr)}</b>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-3)" }}>
                <span className="mono">CPC {money(c.metrics.cpc)} · CPM {money(c.metrics.cpm)}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent)", fontWeight: 600 }}>
                  Tafsilot <ArrowUpRight size={12} />
                </span>
              </div>
              <div className="share-bar" style={{ width: "100%", marginLeft: 0, height: 4 }}>
                <i style={{ width: `${Math.max((c.metrics.spend / maxSpend) * 100, 2)}%` }} />
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
