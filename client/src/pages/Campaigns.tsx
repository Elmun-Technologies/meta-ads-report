import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Download, Filter, Search } from "lucide-react";
import { GOAL_META, type CampaignGoal, type CampaignNode } from "@shared/types";
import { money, pct, ratio, whole, downloadCsv } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { EmptyState, SpendShare } from "@/components/widgets";
import { PageHint } from "@/components/Help";

type SortKey =
  | "spend"
  | "leads"
  | "cpl"
  | "ctr"
  | "cpm"
  | "frequency"
  | "impressions";

/** Maqsadga qarab qaysi son "natija" hisoblanadi: lead kampaniyada — leads,
 * call kampaniyada — qo'ng'iroqlar, engagement kampaniyada — faollik. */
function resultCount(c: CampaignNode): number {
  if (c.goal === "calls") return c.metrics.calls ?? 0;
  if (c.goal === "engagement")
    return c.metrics.postEngagement ?? c.metrics.messagingConversations ?? 0;
  return c.metrics.leads;
}

function resultCost(c: CampaignNode): number | null {
  if (c.goal === "leads") return c.metrics.cpl;
  const n = resultCount(c);
  return n > 0 ? c.metrics.spend / n : null;
}

const SORTERS: Record<SortKey, (a: CampaignNode, b: CampaignNode) => number> = {
  spend: (a, b) => b.metrics.spend - a.metrics.spend,
  leads: (a, b) => resultCount(b) - resultCount(a),
  cpl: (a, b) => (resultCost(a) ?? Infinity) - (resultCost(b) ?? Infinity),
  ctr: (a, b) => (b.metrics.ctr ?? 0) - (a.metrics.ctr ?? 0),
  cpm: (a, b) => (b.metrics.cpm ?? 0) - (a.metrics.cpm ?? 0),
  frequency: (a, b) => (b.metrics.frequency ?? 0) - (a.metrics.frequency ?? 0),
  impressions: (a, b) => b.metrics.impressions - a.metrics.impressions,
};

const COLS: { id: string; key: SortKey | null; label: string; en?: string }[] =
  [
    { id: "name", key: null, label: "Кампания" },
    { id: "goal", key: null, label: "Цель", en: "Goal" },
    { id: "spend", key: "spend", label: "Расход", en: "Spend" },
    {
      id: "impressions",
      key: "impressions",
      label: "Показы",
      en: "Impressions",
    },
    { id: "leads", key: "leads", label: "Результат", en: "Result" },
    { id: "cpl", key: "cpl", label: "Стоимость рез-та", en: "Cost / result" },
    { id: "cpl-vs-avg", key: null, label: "К среднему" },
    { id: "ctr", key: "ctr", label: "Кликабельность", en: "CTR" },
    { id: "cpm", key: "cpm", label: "Цена 1000 показов", en: "CPM" },
    {
      id: "frequency",
      key: "frequency",
      label: "Частота",
      en: "Frequency",
    },
  ];

const GOAL_TONE: Record<CampaignGoal, string> = {
  leads: "goal-leads",
  calls: "goal-calls",
  engagement: "goal-engagement",
  other: "goal-other",
};

export default function Campaigns() {
  const { snapshot, openCampaign } = useDashboardContext();
  const [location] = useLocation();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("spend");
  const [onlyLeads, setOnlyLeads] = useState(false);
  const [expo, setExpo] = useState("all");
  const [goalFilter, setGoalFilter] = useState<"all" | CampaignGoal>("all");

  const focus = useMemo(
    () => new URLSearchParams(location.split("?")[1] || "").get("focus"),
    [location]
  );
  useEffect(() => {
    if (focus && snapshot) {
      openCampaign(focus);
    }
  }, [focus, snapshot, openCampaign]);

  if (!snapshot) return null;

  const expos = [
    "all",
    ...Array.from(new Set(snapshot.campaigns.map(c => c.expo))),
  ];
  const rows = snapshot.campaigns
    .filter(c => (onlyLeads ? resultCount(c) > 0 : true))
    .filter(c => (expo === "all" ? true : c.expo === expo))
    .filter(c => (goalFilter === "all" ? true : c.goal === goalFilter))
    .filter(c => {
      const q = search.toLowerCase();
      return (
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.originalName.toLowerCase().includes(q) ||
        c.id.includes(q)
      );
    })
    .sort(SORTERS[sort]);

  const maxSpend = Math.max(...snapshot.campaigns.map(c => c.metrics.spend), 1);
  const totals = rows.reduce(
    (acc, c) => ({
      spend: acc.spend + c.metrics.spend,
      leads: acc.leads + c.metrics.leads,
      impressions: acc.impressions + c.metrics.impressions,
    }),
    { spend: 0, leads: 0, impressions: 0 }
  );

  const exportCsv = () => {
    downloadCsv(
      `sof-expo-campaigns-${snapshot.meta.period.label.replace(/\s/g, "")}.csv`,
      [
        [
          "Campaign ID",
          "Original name",
          "Canonical name",
          "Expo",
          "Goal",
          "Spend",
          "Impressions",
          "Clicks",
          "Link clicks",
          "Leads",
          "Calls",
          "Result",
          "Cost per result",
          "CTR %",
          "CPM",
          "Frequency",
        ],
        ...rows.map(c => [
          c.id,
          c.originalName,
          c.name,
          c.expo,
          GOAL_META[c.goal].short,
          c.metrics.spend.toFixed(2),
          c.metrics.impressions,
          c.metrics.clicks,
          c.metrics.linkClicks,
          c.metrics.leads,
          c.metrics.calls ?? 0,
          resultCount(c),
          resultCost(c)?.toFixed(2) ?? "N/A",
          c.metrics.ctr?.toFixed(3) ?? "N/A",
          c.metrics.cpm?.toFixed(2) ?? "N/A",
          c.metrics.frequency?.toFixed(2) ?? "N/A",
        ]),
      ]
    );
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
          <span className="kicker">Детальная таблица</span>
          <h1>Кампании</h1>
          <p>
            В таблице {rows.length} кампаний · общий расход{" "}
            {money(totals.spend)} · {whole(totals.leads)} лидов ·{" "}
            {whole(totals.impressions)} показов. Нажмите на любую строку,
            чтобы открыть полную детализацию кампании.
          </p>
        </div>
        <div className="right">
          <button className="tf-btn" onClick={exportCsv}>
            <Download size={13} /> Экспорт CSV
          </button>
        </div>
      </div>

      <PageHint>
        Это основная таблица аккаунта:{" "}
        <b>сколько потратила каждая кампания и сколько лидов принесла.</b>{" "}
        Зеленый цвет в столбце «Стоимость рез-та» означает дешевле среднего, красный — дороже.
        Нажмите на строку, чтобы увидеть все креативы внутри кампании.
      </PageHint>

      <div className="goal-summary">
        {(["leads", "calls", "engagement", "other"] as CampaignGoal[]).map(g => {
          const inGoal = snapshot.campaigns.filter(c => c.goal === g);
          if (!inGoal.length) return null;
          const gSpend = inGoal.reduce((s, c) => s + c.metrics.spend, 0);
          const gResult = inGoal.reduce((s, c) => s + resultCount(c), 0);
          const active = goalFilter === g;
          return (
            <button
              key={g}
              className={`goal-summary-card ${GOAL_TONE[g]} ${active ? "active" : ""}`}
              onClick={() => setGoalFilter(active ? "all" : g)}
            >
              <span className={`goal-badge ${GOAL_TONE[g]}`}>
                {GOAL_META[g].short}
              </span>
              <b>{inGoal.length} кампаний</b>
              <small>
                {money(gSpend)} · {whole(gResult)}{" "}
                {g === "calls" ? "звонков" : g === "engagement" ? "вовлеченность" : "лидов"}
              </small>
            </button>
          );
        })}
      </div>

      <div className="toolbar" style={{ marginBottom: 13 }}>
        <label className="search-box">
          <Search size={14} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по имени или ID…"
          />
        </label>
        <select
          className="select-btn"
          value={expo}
          onChange={e => setExpo(e.target.value)}
        >
          {expos.map(x => (
            <option key={x} value={x}>
              {x === "all" ? "Все Expo" : x}
            </option>
          ))}
        </select>
        <select
          className="select-btn"
          value={goalFilter}
          onChange={e => setGoalFilter(e.target.value as "all" | CampaignGoal)}
        >
          <option value="all">Все цели</option>
          <option value="leads">{GOAL_META.leads.label}</option>
          <option value="calls">{GOAL_META.calls.label}</option>
          <option value="engagement">{GOAL_META.engagement.label}</option>
          <option value="other">{GOAL_META.other.label}</option>
        </select>
        <select
          className="select-btn"
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
        >
          <option value="spend">Сортировка: по расходу</option>
          <option value="leads">Сортировка: по результату</option>
          <option value="cpl">Сортировка: по цене рез-та</option>
          <option value="ctr">Сортировка: по кликабельности</option>
          <option value="cpm">Сортировка: по цене 1000 показов</option>
          <option value="frequency">Сортировка: по частоте</option>
          <option value="impressions">Сортировка: по кол-ву показов</option>
        </select>
        <button
          className={`tf-btn ${onlyLeads ? "on" : ""}`}
          onClick={() => setOnlyLeads(v => !v)}
        >
          <Filter size={13} /> Только с результатами
        </button>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {COLS.map(col => (
                <th
                  key={col.id}
                  className={col.key ? "sortable" : ""}
                  onClick={() => col.key && setSort(col.key)}
                >
                  {col.label}
                  {col.en && <small>{col.en}</small>}
                  {col.key && sort === col.key && " ↓"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={c.id} onClick={() => openCampaign(c.id)}>
                <td>
                  <div className="cell-name">
                    <span className="idx">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="n">
                      <b>{c.name}</b>
                      <small>
                        {c.originalName} · {c.expo} · ID {c.id}
                      </small>
                    </span>
                    <SpendShare share={c.metrics.spend / maxSpend} />
                  </div>
                </td>
                <td>
                  <span className={`goal-badge ${GOAL_TONE[c.goal]}`}>
                    {GOAL_META[c.goal].short}
                  </span>
                  {c.goal === "calls" && (
                    <small className="tone-muted" style={{ display: "block" }}>
                      {whole(c.metrics.calls ?? 0)} звонков
                    </small>
                  )}
                </td>
                <td className="num">{money(c.metrics.spend)}</td>
                <td className="num">{whole(c.metrics.impressions)}</td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {resultCount(c) > 0 ? (
                    whole(resultCount(c))
                  ) : (
                    <span className="tone-muted">—</span>
                  )}
                </td>
                <td className={`num ${cplTone(resultCost(c))}`}>
                  {resultCost(c) != null ? money(resultCost(c)) : "N/A"}
                </td>
                <td className="num">
                  {c.goal === "leads" &&
                  c.metrics.cpl != null &&
                  snapshot.totals.cpl ? (
                    <span className={cplTone(c.metrics.cpl)}>
                      {((c.metrics.cpl - (snapshot.totals.cpl ?? 0)) /
                        (snapshot.totals.cpl ?? 1) >=
                      0
                        ? "+"
                        : "") +
                        (
                          ((c.metrics.cpl - (snapshot.totals.cpl ?? 0)) /
                            (snapshot.totals.cpl ?? 1)) *
                          100
                        ).toFixed(0)}
                      %
                    </span>
                  ) : (
                    <span className="tone-muted">—</span>
                  )}
                </td>
                <td className="num">{pct(c.metrics.ctr)}</td>
                <td className="num">{money(c.metrics.cpm)}</td>
                <td
                  className={`num ${(c.metrics.frequency ?? 0) >= 3 ? "tone-warn" : ""}`}
                >
                  {ratio(c.metrics.frequency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <EmptyState text="Filtrga mos kampaniya topilmadi" />
        )}
      </div>

      <div className="note-strip" style={{ marginTop: 13 }}>
        <span className="kicker" style={{ flex: "none" }}>
          Qanday hisoblanadi
        </span>
        <span>
          <b>Maqsad</b> — kampaniya asosan qaysi natijaga ishlaganini
          ko'rsatadi: <b>Lead</b> (forma to'ldirish), <b>Call</b> (qo'ng'iroq
          tugmasi bosilishi) yoki <b>Engagement</b> (post bilan o'zaro
          ta'sir) — leadlar bo'lmasa keyingi ustuvor natija turi tanlanadi.
          Natija narxi = sarf ÷ shu maqsaddagi natija soni (natija qaytmagan
          kampaniyalarda “N/A”). O'ngdagi chiziq — sarfning jadvaldagi eng
          katta sarfga nisbatan ulushi. Takroriylik 3 va undan yuqori bo'lsa
          sariq rangda: bu auditoriya charchashining belgisi.
        </span>
      </div>
    </>
  );
}
