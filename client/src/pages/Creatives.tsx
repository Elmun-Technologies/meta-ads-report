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
          <span className="kicker">Рейтинг</span>
          <h1>Креативы (рекламные материалы)</h1>
          <p>
            Всего {snapshot.creatives.length} креативов.{" "}
            {withLeads > 0 ? (
              <>
                <b style={{ color: "var(--text)" }}>
                  {withLeads} из них имеют данные по лидам
                </b>{" "}
                — рейтинг по стоимости лида формируется для них; остальные
                оцениваются по расходу и кликабельности.
              </>
            ) : (
              <>
                В этом отчете нет данных по количеству лидов для каждого
                креатива — рейтинг составлен по расходу, кликабельности и кликам.
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
              placeholder="Поиск креатива или адсета…"
            />
          </label>
          <select
            className="select-btn"
            value={rank}
            onChange={e => setRank(e.target.value as Rank)}
          >
            <option value="spend">Рейтинг: по расходу</option>
            <option value="ctr">Рейтинг: по кликабельности</option>
            <option value="clicks">Рейтинг: по количеству кликов</option>
            <option value="cpl">Рейтинг: по стоимости лида (с дешевых)</option>
          </select>
        </div>
      </div>

      <PageHint>
        Здесь мы отвечаем на один вопрос:{" "}
        <b>какое изображение или видео заинтересовало людей больше всего?</b>{" "}
        Креативы с кликабельностью выше среднего выделены зеленым. Нажмите на
        карточку, чтобы открыть полную детализацию креатива.
      </PageHint>

      <Panel
        kicker="Лидеры по кликабельности"
        title="Топ-10 лучших креативов"
        sub="Темный цвет — выше среднего по аккаунту"
        style={{ marginBottom: 14 }}
      >
        <div style={{ height: 280 }}>
          <CtrTopChart data={topCtrChart} avg={snapshot.totals.ctr} />
        </div>
      </Panel>

      {rows.length === 0 ? (
        <EmptyState text="Креативы не найдены" />
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
                    ? "Активен"
                    : c.effectiveStatus === "PAUSED"
                      ? "Остановлен"
                      : (c.effectiveStatus ?? "—")}
                </span>
              </div>
              <div className="c-stats">
                <div>
                  <small>Расход</small>
                  <b>{money(c.metrics.spend)}</b>
                </div>
                <div>
                  <small>Показы</small>
                  <b>{whole(c.metrics.impressions)}</b>
                </div>
                <div>
                  <small>Клики</small>
                  <b>{whole(c.metrics.clicks)}</b>
                </div>
                <div>
                  <small>Кликабельность</small>
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
                      <small>Лиды</small>
                      <b style={{ color: "var(--cyan)" }}>
                        {whole(c.metrics.leads)}
                      </b>
                    </div>
                    <div>
                      <small>Стоимость лида</small>
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
                  Цена клика {money(c.metrics.cpc)} · Цена 1000 показов{" "}
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
                  Детали <ArrowUpRight size={12} />
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
