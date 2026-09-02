import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { money, pct, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { EmptyState, Panel } from "@/components/widgets";
import { PageHint } from "@/components/Help";
import { CtrTopChart } from "@/components/charts";

type Rank = "spend" | "ctr" | "clicks" | "cpl";

export default function Creatives() {
  const { snapshot, openCreative } = useDashboardContext();
  const [query, setQuery] = useState("");
  const [rank, setRank] = useState<Rank>("spend");

  const rows = useMemo(() => {
    if (!snapshot) return [];
    const list = snapshot.creatives.filter(c => {
      const q = query.toLowerCase();
      return (
        !q ||
        c.originalName.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.adset?.originalName ?? "").toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) =>
      rank === "spend"
        ? b.metrics.spend - a.metrics.spend
        : rank === "ctr"
          ? (b.metrics.ctr ?? 0) - (a.metrics.ctr ?? 0)
          : rank === "clicks"
            ? b.metrics.clicks - a.metrics.clicks
            : (a.metrics.cpl ?? Infinity) - (b.metrics.cpl ?? Infinity)
    );
  }, [snapshot, query, rank]);

  if (!snapshot) return null;

  const campaignName = (id: string) =>
    snapshot.campaigns.find(c => c.id === id)?.originalName ?? "—";
  const maxSpend = Math.max(...snapshot.creatives.map(c => c.metrics.spend), 1);
  const withLeads = snapshot.creatives.filter(c => c.hasLeads).length;

  const topCtrChart = [...snapshot.creatives]
    .sort((a, b) => (b.metrics.ctr ?? 0) - (a.metrics.ctr ?? 0))
    .slice(0, 10)
    .map(c => ({
      name: c.originalName,
      short:
        c.originalName.length > 14
          ? `${c.originalName.slice(0, 13)}…`
          : c.originalName,
      ctr: c.metrics.ctr ?? 0,
    }));

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker">Reyting</span>
          <h1>Kreativlar (reklama materiallari)</h1>
          <p>
            Jami {snapshot.creatives.length} ta kreativ.{" "}
            {withLeads > 0 ? (
              <>
                <b style={{ color: "var(--text)" }}>
                  {withLeads} tasi bo'yicha murojaat ma'lumoti ham bor
                </b>{" "}
                — murojaat narxi reytingi shular uchun; qolganlari sarf va
                bosish ulushi bo'yicha baholanadi.
              </>
            ) : (
              <>
                Bu hisobotda har bir kreativ bo'yicha murojaat soni qaytmagan —
                reyting sarf, bosish ulushi va bosishlar bo'yicha tuzilgan.
              </>
            )}
          </p>
        </div>
        <div className="right">
          <label className="search-box">
            <Search size={14} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Kreativ yoki adset qidirish…"
            />
          </label>
          <select
            className="select-btn"
            value={rank}
            onChange={e => setRank(e.target.value as Rank)}
          >
            <option value="spend">Reyting: sarf bo'yicha</option>
            <option value="ctr">Reyting: bosish ulushi</option>
            <option value="clicks">Reyting: bosishlar soni</option>
            <option value="cpl">Reyting: murojaat narxi (arzonidan)</option>
          </select>
        </div>
      </div>

      <PageHint>
        Bu yerda bitta savolga javob izlanadi:{" "}
        <b>qaysi rasm yoki video odamlarni ko'proq qiziqtirdi?</b> Bosish ulushi
        o'rtachadan yuqori bo'lgan kreativlar yashil rangda. Kartani bossangiz —
        kreativning to'liq tafsiloti ochiladi.
      </PageHint>

      <Panel
        kicker="Bosish ulushi yetakchilari"
        title="Eng kuchli 10 ta kreativ"
        sub="To'q rang — hisob bo'yicha o'rtachadan yuqori"
        style={{ marginBottom: 14 }}
      >
        <div style={{ height: 280 }}>
          <CtrTopChart data={topCtrChart} avg={snapshot.totals.ctr} />
        </div>
      </Panel>

      {rows.length === 0 ? (
        <EmptyState text="Kreativ topilmadi" />
      ) : (
        <div className="creative-grid">
          {rows.map((c, i) => (
            <button
              className="creative-card"
              key={`${c.id}-${i}`}
              onClick={() => openCreative(c.id)}
            >
              <div className="c-top">
                <span className="rank-badge">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="c-name">
                  <b title={c.originalName}>{c.originalName}</b>
                  <small title={campaignName(c.campaignId)}>
                    {campaignName(c.campaignId)} ·{" "}
                    {c.adset?.originalName ?? "—"}
                  </small>
                </div>
                <span
                  className={`chip ${c.effectiveStatus === "ACTIVE" ? "good" : "muted"}`}
                  style={{ marginLeft: "auto", flex: "none" }}
                >
                  {c.effectiveStatus === "ACTIVE"
                    ? "Faol"
                    : c.effectiveStatus === "PAUSED"
                      ? "To'xtatilgan"
                      : (c.effectiveStatus ?? "—")}
                </span>
              </div>
              <div className="c-stats">
                <div>
                  <small>Sarf</small>
                  <b>{money(c.metrics.spend)}</b>
                </div>
                <div>
                  <small>Ko'rsatuv</small>
                  <b>{whole(c.metrics.impressions)}</b>
                </div>
                <div>
                  <small>Bosish</small>
                  <b>{whole(c.metrics.clicks)}</b>
                </div>
                <div>
                  <small>Bosish ulushi</small>
                  <b
                    style={{
                      color:
                        (c.metrics.ctr ?? 0) >= (snapshot.totals.ctr ?? 0)
                          ? "var(--good)"
                          : "var(--text)",
                    }}
                  >
                    {pct(c.metrics.ctr)}
                  </b>
                </div>
                {c.hasLeads && (
                  <>
                    <div>
                      <small>Murojaat</small>
                      <b style={{ color: "var(--cyan)" }}>
                        {whole(c.metrics.leads)}
                      </b>
                    </div>
                    <div>
                      <small>Murojaat narxi</small>
                      <b
                        style={{
                          color:
                            (c.metrics.cpl ?? 0) <=
                            (snapshot.totals.cpl ?? Infinity)
                              ? "var(--good)"
                              : "var(--warn)",
                        }}
                      >
                        {money(c.metrics.cpl)}
                      </b>
                    </div>
                  </>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 10.5,
                  color: "var(--text-3)",
                }}
              >
                <span>
                  Bosish narxi {money(c.metrics.cpc)} · 1000 ko'rsatuv narxi{" "}
                  {money(c.metrics.cpm)}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    color: "var(--accent)",
                    fontWeight: 600,
                  }}
                >
                  Tafsilot <ArrowUpRight size={12} />
                </span>
              </div>
              <div
                className="share-bar"
                style={{ width: "100%", marginLeft: 0, height: 4 }}
              >
                <i
                  style={{
                    width: `${Math.max((c.metrics.spend / maxSpend) * 100, 2)}%`,
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
