import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Coins, Eye, MousePointerClick, Target, Users, Zap } from "lucide-react";
import { PLATFORM_META } from "@shared/types";
import type { Insight } from "@/lib/insights";
import { buildInsights } from "@/lib/insights";
import { compact, money, pct, ratio, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { Funnel, InsightCard, KpiCard, Panel, SpendShare } from "@/components/widgets";
import { LeadsCplChart, SpendByCampaignChart } from "@/components/charts";

const shorten = (name: string, max = 22) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

export default function Overview() {
  const { snapshot, openCampaign, openCreative } = useDashboardContext();

  const insights = useMemo(() => (snapshot ? buildInsights(snapshot) : []), [snapshot]);

  if (!snapshot) return null;
  const { totals, campaigns, creatives, age } = snapshot;
  const maxSpend = Math.max(...campaigns.map((c) => c.metrics.spend), 1);

  const spendChart = campaigns.slice(0, 9).map((c) => ({ name: c.originalName, short: shorten(c.originalName), spend: c.metrics.spend, leads: c.metrics.leads }));
  const leadCampaigns = campaigns.filter((c) => c.metrics.leads > 0).slice(0, 10);
  const cplChart = leadCampaigns.map((c) => ({ name: c.originalName, short: shorten(c.originalName, 10), leads: c.metrics.leads, cpl: c.metrics.cpl }));
  const topCreative = [...creatives].sort((a, b) => b.metrics.spend - a.metrics.spend)[0];
  const bestAge = [...age].sort((a, b) => b.leads - a.leads)[0];
  const cplList = campaigns.map((c) => c.metrics.cpl).filter((c): c is number => c != null);
  const bestCpl = cplList.length ? Math.min(...cplList) : null;
  const maxLeads = campaigns.length ? Math.max(...campaigns.map((c) => c.metrics.leads)) : 0;

  const onInsightAction = (insight: Insight) => {
    if (insight.action?.kind === "campaign" && insight.action.id) openCampaign(insight.action.id);
    else if (insight.action?.kind === "creatives" && insight.action.id) openCreative(insight.action.id);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker" style={{ color: "var(--accent)" }}>
            UMUMIY NATIJALAR · {snapshot.meta.period.label}
          </span>
          <h1>Boshqaruv paneli</h1>
          <p>
            {snapshot.meta.account.name} kabineti uchun to'liq skvoznaya tahlil: {campaigns.length} kampaniya, {creatives.length} kreativ, {whole(totals.impressions)} ko'rsatuv.
            Barcha raqamlar {snapshot.meta.sourceLabel} manbasidan.
          </p>
        </div>
        <div className="right">
          <span className="chip good">
            <i /> {PLATFORM_META[snapshot.meta.platform].name.toUpperCase()} · ULANGAN
          </span>
          <span className="chip muted">{snapshot.meta.account.currency} valyutasi</span>
        </div>
      </div>

      {/* KPI ledger */}
      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-4">
          <KpiCard
            label="Spend"
            value={money(totals.spend)}
            icon={<Coins size={15} />}
            sub={
              <>
                Jami sarf · <b>{campaigns.length}</b> kampaniya bo'yicha
              </>
            }
            foot={
              <>
                <span>Eng katta: {money(campaigns[0]?.metrics.spend ?? 0)}</span>
                <SpendShare share={(campaigns[0]?.metrics.spend ?? 0) / (totals.spend || 1)} />
              </>
            }
            tone="var(--accent)"
          />
        </div>
        <div className="col-4">
          <KpiCard
            label="Leads"
            value={whole(totals.leads)}
            icon={<Target size={15} />}
            tone="var(--cyan)"
            sub={
              <>
                Lead qaytgan kampaniyalar: <b>{campaigns.filter((c) => c.metrics.leads > 0).length}</b>
              </>
            }
            foot={<span>Eng yaxshi: {whole(maxLeads)} lead</span>}
          />
        </div>
        <div className="col-4">
          <KpiCard
            label="Cost per lead"
            value={money(totals.cpl)}
            icon={<Zap size={15} />}
            tone="var(--violet)"
            sub={
              <>
                Account o'rtachasi · eng arzon <b>{bestCpl != null ? money(bestCpl) : "N/A"}</b>
              </>
            }
            foot={<span>Video views: {compact(totals.videoViews)}</span>}
          />
        </div>
        <div className="col-4">
          <KpiCard
            label="CTR (all)"
            value={pct(totals.ctr)}
            icon={<MousePointerClick size={15} />}
            tone="var(--warn)"
            sub={
              <>
                <b>{whole(totals.clicks)}</b> clicks · <b>{whole(totals.linkClicks)}</b> link clicks
              </>
            }
            foot={<span>Link CTR: {pct(totals.linkCtr)}</span>}
          />
        </div>
        <div className="col-4">
          <KpiCard
            label="CPM"
            value={money(totals.cpm)}
            icon={<Eye size={15} />}
            tone="var(--good)"
            sub={
              <>
                1000 ko'rsatuv narxi · CPC <b>{money(totals.cpc)}</b>
              </>
            }
            foot={<span>Frequency: {ratio(totals.frequency)}</span>}
          />
        </div>
        <div className="col-4">
          <KpiCard
            label="Reach"
            value={whole(totals.reach)}
            icon={<Users size={15} />}
            tone="var(--risk)"
            sub={
              <>
                Noyob auditoriya · <b>{compact(totals.impressions)}</b> impressions
              </>
            }
            foot={<span>Eng faol segment: {bestAge?.age ?? "—"}</span>}
          />
        </div>
      </div>

      {/* Insights */}
      <Panel kicker="AVTOMATIK XULOSA DVIGATELI" title="Raqlar nima deyapti?" sub="Snapshot ustidan hisoblangan xulosalar — har sync'da yangilanadi" style={{ marginBottom: 14 }}>
        <div className="grid-12" style={{ gap: 11 }}>
          {insights.map((insight) => (
            <div className="col-6" key={insight.id}>
              <InsightCard insight={insight} onAction={onInsightAction} />
            </div>
          ))}
        </div>
      </Panel>

      {/* Funnel + spend */}
      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-5">
          <Panel kicker="SKVOZNAYA VORONKA" title="Impression'dan lead'gacha">
            <Funnel
              stages={[
                { key: "imp", label: "Impressions", note: "KO'RSATUVLAR", value: totals.impressions, tone: "var(--accent)" },
                { key: "reach", label: "Reach", note: "NOYOB AUDITORIYA", value: totals.reach ?? 0, tone: "var(--accent)" },
                { key: "clicks", label: "Clicks (all)", note: "BARCHA BOSILISH", value: totals.clicks, tone: "var(--cyan)" },
                { key: "link", label: "Link clicks", note: "HAVOLA BOSILISH", value: totals.linkClicks, tone: "var(--cyan)" },
                { key: "lpv", label: "Landing views", note: "SAHIFAGA O'TISH", value: totals.landingPageViews ?? 0, tone: "var(--violet)" },
                { key: "leads", label: "Leads", note: "YAKUNIY NATIJA", value: totals.leads, tone: "var(--good)" },
              ]}
            />
          </Panel>
        </div>
        <div className="col-7">
          <Panel kicker="BYUDJET TAQSIMOTI" title="Spend by campaign" sub="Eng ko'p pul ketgan 9 kampaniya" action={<Link className="panel-link" href="/campaigns">To'liq jadval <ArrowUpRight size={12} /></Link>}>
            <div style={{ height: 322 }}>
              <SpendByCampaignChart data={spendChart} />
            </div>
          </Panel>
        </div>
      </div>

      {/* Leads/CPL + top creative */}
      <div className="grid-12">
        <div className="col-7">
          <Panel kicker="SAMARADORLIK" title="Leads va CPL taqqoslash" sub="Lead bergan kampaniyalar: ustunlar — leads, chiziq — CPL">
            <div style={{ height: 286 }}>
              <LeadsCplChart data={cplChart} />
            </div>
          </Panel>
        </div>
        <div className="col-5">
          <Panel kicker="TOP KREATIV" title="Eng ko'p ishlagan kreativ">
            {topCreative ? (
              <div className="creative-card" style={{ background: "var(--panel-2)" }}>
                <div className="c-top">
                  <span className="rank-badge" style={{ background: "linear-gradient(135deg, var(--accent), var(--violet))" }}>01</span>
                  <div className="c-name">
                    <b>{topCreative.originalName}</b>
                    <small>{topCreative.adset?.originalName ?? "—"}</small>
                  </div>
                </div>
                <div className="c-stats">
                  <div>
                    <small>Spend</small>
                    <b>{money(topCreative.metrics.spend)}</b>
                  </div>
                  <div>
                    <small>Impr.</small>
                    <b>{compact(topCreative.metrics.impressions)}</b>
                  </div>
                  <div>
                    <small>Clicks</small>
                    <b>{whole(topCreative.metrics.clicks)}</b>
                  </div>
                  <div>
                    <small>CTR</small>
                    <b>{pct(topCreative.metrics.ctr)}</b>
                  </div>
                </div>
                <button className="primary-btn" onClick={() => openCreative(topCreative.id)}>
                  Kreativ tafsiloti <ArrowUpRight size={13} />
                </button>
              </div>
            ) : (
              <div className="empty-state">Kreativ ma'lumoti topilmadi</div>
            )}
            <div style={{ marginTop: 12 }}>
              <span className="kicker">ADSET CONTEXT</span>
              <p style={{ fontSize: 11.5, color: "var(--text-2)", margin: "6px 0 0", lineHeight: 1.6 }}>
                Ad-darajadagi lead metrikasi bu hisobotda qaytmagan — kreativ samaradorligi spend/CTR orqali o'lchanadi. Lead darajasidagi xulosa kampaniya kesimida beriladi.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
