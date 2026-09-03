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
    { id: "name", key: null, label: "Kampaniya" },
    { id: "goal", key: null, label: "Maqsad", en: "Goal" },
    { id: "spend", key: "spend", label: "Sarf", en: "Spend" },
    {
      id: "impressions",
      key: "impressions",
      label: "Ko'rsatuvlar",
      en: "Impressions",
    },
    { id: "leads", key: "leads", label: "Natija", en: "Result" },
    { id: "cpl", key: "cpl", label: "Natija narxi", en: "Cost / result" },
    { id: "cpl-vs-avg", key: null, label: "O'rtachaga nisbatan" },
    { id: "ctr", key: "ctr", label: "Bosish ulushi", en: "CTR" },
    { id: "cpm", key: "cpm", label: "1000 ko'rsatuv narxi", en: "CPM" },
    {
      id: "frequency",
      key: "frequency",
      label: "Takroriylik",
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
          <span className="kicker">Batafsil jadval</span>
          <h1>Kampaniyalar</h1>
          <p>
            Jadvalda {rows.length} ta kampaniya · jami sarf{" "}
            {money(totals.spend)} · {whole(totals.leads)} ta murojaat ·{" "}
            {whole(totals.impressions)} ta ko'rsatuv. Har bir qatorni bossangiz
            — kampaniyaning to'liq tafsiloti ochiladi.
          </p>
        </div>
        <div className="right">
          <button className="tf-btn" onClick={exportCsv}>
            <Download size={13} /> CSV eksport
          </button>
        </div>
      </div>

      <PageHint>
        Bu hisobning asosiy jadvali:{" "}
        <b>har bir kampaniya qancha pul yeb, qancha murojaat olib keldi.</b>{" "}
        “Murojaat narxi” ustunidagi yashil — o'rtachadan arzon, qizil — qimmat.
        Qatorni bossangiz — kampaniya ichidagi barcha kreativlar ochiladi.
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
              <b>{inGoal.length} ta kampaniya</b>
              <small>
                {money(gSpend)} · {whole(gResult)}{" "}
                {g === "calls" ? "qo'ng'iroq" : g === "engagement" ? "faollik" : "murojaat"}
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
            placeholder="Nom yoki ID bo'yicha qidirish…"
          />
        </label>
        <select
          className="select-btn"
          value={expo}
          onChange={e => setExpo(e.target.value)}
        >
          {expos.map(x => (
            <option key={x} value={x}>
              {x === "all" ? "Barcha Expo'lar" : x}
            </option>
          ))}
        </select>
        <select
          className="select-btn"
          value={goalFilter}
          onChange={e => setGoalFilter(e.target.value as "all" | CampaignGoal)}
        >
          <option value="all">Barcha maqsadlar</option>
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
          <option value="spend">Tartib: sarf bo'yicha</option>
          <option value="leads">Tartib: natija soni</option>
          <option value="cpl">Tartib: natija narxi (arzonidan)</option>
          <option value="ctr">Tartib: bosish ulushi</option>
          <option value="cpm">Tartib: 1000 ko'rsatuv narxi</option>
          <option value="frequency">Tartib: takroriylik</option>
          <option value="impressions">Tartib: ko'rsatuvlar soni</option>
        </select>
        <button
          className={`tf-btn ${onlyLeads ? "on" : ""}`}
          onClick={() => setOnlyLeads(v => !v)}
        >
          <Filter size={13} /> Faqat natija berganlar
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
                      {whole(c.metrics.calls ?? 0)} qo'ng'iroq
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
