import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Coins, Eye, MessageSquare, MousePointerClick, Radar, Target, Users, Video, Zap } from "lucide-react";
import { PLATFORM_META, type CampaignNode } from "@shared/types";
import type { Insight } from "@/lib/insights";
import { buildInsights } from "@/lib/insights";
import { buildAlerts, buildAnomalies, buildPacing, SEVERITY_META } from "@/lib/alerts";
import { buildCrmSummary } from "@shared/amo";
import { compact, money, pct, ratio, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { Funnel, InsightCard, KpiCard, Panel, SpendShare } from "@/components/widgets";
import { LeadsCplChart, SpendByCampaignChart } from "@/components/charts";

const shorten = (name: string, max = 22) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

export default function Overview() {
  const { snapshot, crm, crmConnected, openCampaign, openCreative } = useDashboardContext();

  const insights = useMemo(() => (snapshot ? buildInsights(snapshot) : []), [snapshot]);
  const alerts = useMemo(() => (snapshot ? buildAlerts(snapshot) : []), [snapshot]);
  const anomalies = useMemo(() => (snapshot ? buildAnomalies(snapshot) : []), [snapshot]);
  const pacing = useMemo(() => (snapshot ? buildPacing(snapshot) : null), [snapshot]);
  const crmSummary = useMemo(() => (crmConnected && crm && snapshot ? buildCrmSummary(crm, snapshot) : null), [crmConnected, crm, snapshot]);
  const engagement = useMemo(() => {
    if (!snapshot) return null;
    const sum = (f: (c: CampaignNode) => number) => snapshot.campaigns.reduce((s, c) => s + f(c), 0);
    const postEngagement = sum((c) => c.metrics.postEngagement ?? 0);
    const videoViews = sum((c) => c.metrics.videoViews ?? 0);
    const messaging = snapshot.totals.messagingConversations ?? sum((c) => c.metrics.messagingConversations ?? 0);
    const firstReply = sum((c) => c.metrics.messagingFirstReply ?? 0);
    const top = snapshot.campaigns
      .filter((c) => (c.metrics.postEngagement ?? 0) > 0)
      .sort((a, b) => (b.metrics.postEngagement ?? 0) - (a.metrics.postEngagement ?? 0))
      .slice(0, 5);
    return {
      postEngagement,
      reactions: sum((c) => c.metrics.reactions ?? 0),
      comments: sum((c) => c.metrics.comments ?? 0),
      saves: sum((c) => c.metrics.saves ?? 0),
      videoViews,
      messaging,
      firstReply,
      top,
    };
  }, [snapshot]);

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

      {/* Signallar + Pacing */}
      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-7">
          <Panel
            kicker="SIGNAL MARKAZI"
            title="Nima ga e'tibor berish kerak"
            sub="Qoidalar dvigateli real vaqtda hisoblaydi"
            action={<span className="chip muted">{alerts.length} signal</span>}
          >
            {alerts.length === 0 && <div className="empty-state">Signal yo'q — hammasi tartibda ✓</div>}
            {alerts.slice(0, 5).map((a) => (
              <button
                key={a.id}
                className="sig-row"
                onClick={() => (a.target?.kind === "campaign" ? openCampaign(a.target.id) : a.target?.kind === "creative" ? openCreative(a.target.id) : undefined)}
              >
                <span className={`chip ${SEVERITY_META[a.severity].chip}`} style={{ flex: "none", minWidth: 64, justifyContent: "center" }}>
                  {SEVERITY_META[a.severity].label}
                </span>
                <span style={{ minWidth: 0 }}>
                  <b>{a.title}</b>
                  <small>{a.body}</small>
                </span>
                {(a.target?.kind === "campaign" || a.target?.kind === "creative") && <ArrowUpRight size={14} style={{ flex: "none", color: "var(--text-3)" }} />}
              </button>
            ))}
            {anomalies.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
                <span className="kicker" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Radar size={12} /> STATISTIK ANOMALIYALAR (MAD Z-SCORE ≥ 2)
                </span>
                {anomalies.slice(0, 3).map((an, i) => (
                  <button key={`${an.campaignId}-${an.metric}-${i}`} className="sig-row" onClick={() => openCampaign(an.campaignId)}>
                    <span className={`chip ${an.direction === "high" ? "warn" : "accent"}`} style={{ flex: "none", minWidth: 64, justifyContent: "center" }}>
                      {an.metric} {an.direction === "high" ? "↑" : "↓"}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b>
                        {an.campaign} — {an.value}
                      </b>
                      <small>
                        z = {an.z.toFixed(1)} · {an.why}
                      </small>
                    </span>
                    <ArrowUpRight size={14} style={{ flex: "none", color: "var(--text-3)" }} />
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div className="col-5">
          <Panel kicker="BYUDJET SUR'ATI VA PROGNOZ" title="Pacing" sub={pacing?.daysNote}>
            {pacing && (
              <>
                <div className="pace-grid">
                  <div>
                    <small>Kunlik sarf</small>
                    <b>{money(pacing.dailySpend)}</b>
                  </div>
                  <div>
                    <small>Kunlik lead</small>
                    <b>{pacing.dailyLeads.toFixed(1)}</b>
                  </div>
                  <div>
                    <small>30 kun prognoz (sarf)</small>
                    <b>{money(pacing.projected30Spend)}</b>
                  </div>
                  <div>
                    <small>30 kun prognoz (lead)</small>
                    <b>{whole(pacing.projected30Leads)}</b>
                  </div>
                </div>
                {pacing.scale && (
                  <div className="what-if">
                    <span className="kicker">WHAT-IF: SCALE TEST</span>
                    <p>
                      «{pacing.scale.name}» CPL {money(pacing.scale.cpl)} — <b>+$100 byudjet ≈ +{pacing.scale.extraLeadsPer100} lead</b>. CRM lead sifati tasdiqlasa, eng tez o'sish shu yerda.
                    </p>
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      </div>

      {/* CRM lifecycle strip */}
      <div className="grid-12">
        <div className="col-12">
          {crmSummary && crm ? (
            <Panel
              kicker="LEAD LIFECYCLE · AMOCRM"
              title="Reklamadan bitimgacha — yopiq sikl"
              action={
                <Link className="panel-link" href="/pipeline">
                  Lifecycle doskasini ochish <ArrowUpRight size={12} />
                </Link>
              }
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 9 }}>
                {[
                  { l: "Leads (CRM)", v: whole(crmSummary.totalLeads), c: "var(--accent)" },
                  { l: "Jarayonda", v: whole(crmSummary.inProgress), c: "var(--text-2)" },
                  { l: "Yutiq", v: whole(crmSummary.won), c: "var(--good)" },
                  { l: "Yo'qotish", v: whole(crmSummary.lost), c: "var(--risk)" },
                  { l: "Win rate", v: crmSummary.winRate != null ? pct(crmSummary.winRate, 1) : "N/A", c: "var(--cyan)" },
                  { l: "Tushum", v: `${compact(crmSummary.revenue)} ${crm.currency}`, c: "var(--good)" },
                  { l: "Cost per WON", v: crmSummary.costPerWon != null ? money(crmSummary.costPerWon) : "N/A", c: "var(--violet)" },
                  { l: "ROAS", v: crmSummary.roas != null ? `${crmSummary.roas.toFixed(1)}×` : "N/A", c: (crmSummary.roas ?? 0) >= 1 ? "var(--good)" : "var(--risk)" },
                ].map((k) => (
                  <div key={k.l} style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel-2)", padding: "10px 12px" }}>
                    <small style={{ display: "block", fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: "0.1em", color: "var(--text-3)", textTransform: "uppercase" }}>{k.l}</small>
                    <b style={{ display: "block", fontFamily: "var(--mono)", fontSize: 17, fontWeight: 650, color: k.c, marginTop: 5 }}>{k.v}</b>
                  </div>
                ))}
              </div>
              <div className="note-strip" style={{ marginTop: 11 }}>
                <span className="kicker" style={{ flex: "none" }}>
                  MATCH
                </span>
                <span>
                  {crm.matchedLeads}/{crm.leads.length} lead UTM orqali reklamaga bog'langan. Bog'lanmaganlari taxminiy hisobga kiritilmagan — <Link className="panel-link" href="/pipeline" style={{ display: "inline-flex" }}>batafsil</Link>.
                </span>
              </div>
            </Panel>
          ) : (
            <Panel kicker="LEAD LIFECYCLE · AMOCRM" title="Keyingi qadam: lead'gina emas — bitimgacha" action={<Link className="panel-link" href="/pipeline">Qanday ulanadi <ArrowUpRight size={12} /></Link>}>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>
                AmoCRM ulanganda (amo_*.json snapshot) shu panelda win rate, tushum, cost per WON va ROAS paydo bo'ladi — har bir lead o'z kampaniyasiga UTM orqali bog'lanadi. UI to'liq tayyor: <b>/pipeline</b> sahifasida kanban doska va manba atributsiyasi kutib turibdi.
              </p>
            </Panel>
          )}
        </div>
      </div>

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

      {/* Interaksiya va video */}
      {engagement && engagement.postEngagement > 0 && (
        <div className="grid-12" style={{ marginBottom: 14 }}>
          <div className="col-7">
            <Panel kicker="INTERAKSIYA REYTINGI" title="Auditoriya qanday javob berdi" sub="Post interaksiyasi (reaksiya, komment, saqlash, barcha bosishlar) bo'yicha top-5">
              <div className="tbl-wrap">
                <table className="tbl" style={{ minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th>Kampaniya</th>
                      <th>Interaksiya</th>
                      <th>Reaksiya</th>
                      <th>Komm.</th>
                      <th>Saqlash</th>
                      <th>Eng. rate</th>
                      <th>Sarf/inter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {engagement.top.map((c) => {
                      const er = c.metrics.impressions ? ((c.metrics.postEngagement ?? 0) / c.metrics.impressions) * 100 : null;
                      const cpe = c.metrics.postEngagement ? c.metrics.spend / c.metrics.postEngagement : null;
                      return (
                        <tr key={c.id} onClick={() => openCampaign(c.id)}>
                          <td>
                            <div className="cell-name">
                              <span className="n">
                                <b>{c.originalName}</b>
                                <small>{c.expo}</small>
                              </span>
                            </div>
                          </td>
                          <td className="num" style={{ fontWeight: 600 }}>
                            {whole(c.metrics.postEngagement)}
                          </td>
                          <td className="num">{whole(c.metrics.reactions ?? 0)}</td>
                          <td className="num">{whole(c.metrics.comments ?? 0)}</td>
                          <td className="num">{whole(c.metrics.saves ?? 0)}</td>
                          <td className="num">{er != null ? pct(er, 2) : "N/A"}</td>
                          <td className="num">{cpe != null ? `$${cpe.toFixed(3)}` : "N/A"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
          <div className="col-5">
            <Panel kicker="VIDEO VA MESSAGING" title="Chuqurroq jalb qilish">
              <div className="pace-grid">
                <div>
                  <small>
                    <Video size={10} style={{ display: "inline", marginRight: 4 }} /> Video 30s views
                  </small>
                  <b>{compact(engagement.videoViews)}</b>
                </div>
                <div>
                  <small>Sarf / 30s view</small>
                  <b>{engagement.videoViews ? money(totals.spend / engagement.videoViews) : "N/A"}</b>
                </div>
                <div>
                  <small>
                    <MessageSquare size={10} style={{ display: "inline", marginRight: 4 }} /> Suhbat boshlandi
                  </small>
                  <b>{whole(engagement.messaging)}</b>
                </div>
                <div>
                  <small>Birinchi javob berguncha</small>
                  <b>
                    {engagement.messaging ? `${whole(engagement.firstReply)} (${pct((engagement.firstReply / engagement.messaging) * 100, 0)})` : "N/A"}
                  </b>
                </div>
              </div>
              <div className="what-if" style={{ marginTop: 11 }}>
                <span className="kicker">INTERAKSIYA HISOBI</span>
                <p>
                  Jami <b>{whole(engagement.postEngagement)}</b> post interaksiyasi: <b>{whole(engagement.reactions)}</b> reaksiya · <b>{whole(engagement.comments)}</b> komment · <b>{whole(engagement.saves)}</b> saqlash. Har bir interaksiya uchun o'rtacha <b>{money(totals.spend / engagement.postEngagement)}</b> sarf.
                  {engagement.messaging > 0 && engagement.firstReply > 0 && (
                    <>
                      {" "}Messaging kanalida suhbatlarning <b>{pct((engagement.firstReply / engagement.messaging) * 100, 0)}</b> javob olgan — qolganlari javobsiz qolgan.
                    </>
                  )}
                </p>
              </div>
            </Panel>
          </div>
        </div>
      )}

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
                  {topCreative.hasLeads && (
                    <>
                      <div>
                        <small>Leads</small>
                        <b style={{ color: "var(--cyan)" }}>{whole(topCreative.metrics.leads)}</b>
                      </div>
                      <div>
                        <small>CPL</small>
                        <b style={{ color: "var(--good)" }}>{money(topCreative.metrics.cpl)}</b>
                      </div>
                    </>
                  )}
                </div>
                <button className="primary-btn" onClick={() => openCreative(topCreative.id)}>
                  Kreativ tafsiloti <ArrowUpRight size={13} />
                </button>
              </div>
            ) : (
              <div className="empty-state">Kreativ ma'lumoti topilmadi</div>
            )}
            {topCreative && !topCreative.hasLeads && (
              <div style={{ marginTop: 12 }}>
                <span className="kicker">ADSET CONTEXT</span>
                <p style={{ fontSize: 11.5, color: "var(--text-2)", margin: "6px 0 0", lineHeight: 1.6 }}>
                  Bu kreativda ad-level lead metrikasi qaytmagan — samaradorlik spend/CTR orqali o'lchanadi. Lead darajasidagi xulosa kampaniya kesimida beriladi.
                </p>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
