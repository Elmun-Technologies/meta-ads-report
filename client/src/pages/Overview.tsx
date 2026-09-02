import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowUpRight, MessageSquare, Radar, Video } from "lucide-react";
import { PLATFORM_META, type CampaignNode } from "@shared/types";
import type { Insight } from "@/lib/insights";
import { buildInsights } from "@/lib/insights";
import {
  buildAlerts,
  buildAnomalies,
  buildPacing,
  SEVERITY_META,
} from "@/lib/alerts";
import { buildCrmSummary } from "@shared/amo";
import { compact, money, pct, ratio, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import {
  Funnel,
  InsightCard,
  KpiCard,
  Panel,
  SpendShare,
} from "@/components/widgets";
import { PageHint, Term } from "@/components/Help";
import { LeadsCplChart, SpendByCampaignChart } from "@/components/charts";

const shorten = (name: string, max = 22) =>
  name.length > max ? `${name.slice(0, max - 1)}…` : name;

export default function Overview() {
  const { snapshot, crm, crmConnected, openCampaign, openCreative } =
    useDashboardContext();

  const insights = useMemo(
    () => (snapshot ? buildInsights(snapshot) : []),
    [snapshot]
  );
  const alerts = useMemo(
    () => (snapshot ? buildAlerts(snapshot) : []),
    [snapshot]
  );
  const anomalies = useMemo(
    () => (snapshot ? buildAnomalies(snapshot) : []),
    [snapshot]
  );
  const pacing = useMemo(
    () => (snapshot ? buildPacing(snapshot) : null),
    [snapshot]
  );
  const crmSummary = useMemo(
    () =>
      crmConnected && crm && snapshot ? buildCrmSummary(crm, snapshot) : null,
    [crmConnected, crm, snapshot]
  );
  const engagement = useMemo(() => {
    if (!snapshot) return null;
    const sum = (f: (c: CampaignNode) => number) =>
      snapshot.campaigns.reduce((s, c) => s + f(c), 0);
    const postEngagement = sum(c => c.metrics.postEngagement ?? 0);
    const videoViews = sum(c => c.metrics.videoViews ?? 0);
    const messaging =
      snapshot.totals.messagingConversations ??
      sum(c => c.metrics.messagingConversations ?? 0);
    const firstReply = sum(c => c.metrics.messagingFirstReply ?? 0);
    const top = snapshot.campaigns
      .filter(c => (c.metrics.postEngagement ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.metrics.postEngagement ?? 0) - (a.metrics.postEngagement ?? 0)
      )
      .slice(0, 5);
    return {
      postEngagement,
      reactions: sum(c => c.metrics.reactions ?? 0),
      comments: sum(c => c.metrics.comments ?? 0),
      saves: sum(c => c.metrics.saves ?? 0),
      videoViews,
      messaging,
      firstReply,
      top,
    };
  }, [snapshot]);

  if (!snapshot) return null;
  const { totals, campaigns, creatives, age } = snapshot;
  const maxSpend = Math.max(...campaigns.map(c => c.metrics.spend), 1);

  const spendChart = campaigns
    .slice(0, 9)
    .map(c => ({
      name: c.originalName,
      short: shorten(c.originalName),
      spend: c.metrics.spend,
      leads: c.metrics.leads,
    }));
  const leadCampaigns = campaigns.filter(c => c.metrics.leads > 0).slice(0, 10);
  const cplChart = leadCampaigns.map(c => ({
    name: c.originalName,
    short: shorten(c.originalName, 10),
    leads: c.metrics.leads,
    cpl: c.metrics.cpl,
  }));
  const topCreative = [...creatives].sort(
    (a, b) => b.metrics.spend - a.metrics.spend
  )[0];
  const bestAge = [...age].sort((a, b) => b.leads - a.leads)[0];
  const cplList = campaigns
    .map(c => c.metrics.cpl)
    .filter((c): c is number => c != null);
  const bestCpl = cplList.length ? Math.min(...cplList) : null;
  const maxLeads = campaigns.length
    ? Math.max(...campaigns.map(c => c.metrics.leads))
    : 0;

  const onInsightAction = (insight: Insight) => {
    if (insight.action?.kind === "campaign" && insight.action.id)
      openCampaign(insight.action.id);
    else if (insight.action?.kind === "creatives" && insight.action.id)
      openCreative(insight.action.id);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker">
            {snapshot.meta.period.label} ·{" "}
            {PLATFORM_META[snapshot.meta.platform].name}
          </span>
          <h1>Umumiy natijalar</h1>
          <p>
            {snapshot.meta.account.name} kabineti: {campaigns.length} ta
            kampaniya, {creatives.length} ta kreativ,{" "}
            {whole(totals.impressions)} ta ko‘rsatuv. Barcha raqamlar{" "}
            {snapshot.meta.sourceLabel} manbasidan olingan — taxminiy
            hisob-kitob yo‘q.
          </p>
        </div>
        <div className="right">
          <span className="chip good">
            <i /> Ma’lumot ulangan
          </span>
          <span className="chip muted">
            {snapshot.meta.account.currency} valyutasi
          </span>
        </div>
      </div>

      <PageHint>
        Bu sahifa bitta savolga javob beradi:{" "}
        <b>
          reklamaga ketgan pul qancha murojaat olib keldi va muammo qayerda?
        </b>{" "}
        Tepada oltita asosiy ko‘rsatkich, pastda esa raqamlardan chiqarilgan
        tayyor xulosa va diqqat talab qiladigan kampaniyalar ro‘yxati. Nom
        yonidagi <b>?</b> belgisi — bu ko‘rsatkich nimaligini tushuntiradi.
      </PageHint>

      {/* KPI ledger */}
      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-4">
          <KpiCard
            label={
              <>
                <Term id="spend">Sarf</Term> <i>(Spend)</i>
              </>
            }
            value={money(totals.spend)}
            sub={
              <>
                Jami sarf · <b>{campaigns.length}</b> ta kampaniya bo‘yicha
              </>
            }
            note="Shu davrda reklamaga ketgan pul."
            foot={
              <>
                <span>
                  Eng katta: {money(campaigns[0]?.metrics.spend ?? 0)}
                </span>
                <SpendShare
                  share={
                    (campaigns[0]?.metrics.spend ?? 0) / (totals.spend || 1)
                  }
                />
              </>
            }
            tone="var(--accent)"
          />
        </div>
        <div className="col-4">
          <KpiCard
            label={
              <>
                <Term id="leads">Murojaatlar</Term> <i>(Leads)</i>
              </>
            }
            value={whole(totals.leads)}
            tone="var(--cyan)"
            sub={
              <>
                Murojaat qaytgan kampaniyalar:{" "}
                <b>{campaigns.filter(c => c.metrics.leads > 0).length}</b> /{" "}
                {campaigns.length}
              </>
            }
            note="Forma to‘ldirgan yoki xabar yozgan odamlar soni."
            foot={<span>Bir kampaniyadan eng ko‘pi: {whole(maxLeads)}</span>}
          />
        </div>
        <div className="col-4">
          <KpiCard
            label={
              <>
                <Term id="cpl">Murojaat narxi</Term> <i>(CPL)</i>
              </>
            }
            value={money(totals.cpl)}
            tone="var(--violet)"
            sub={
              <>
                Hisob bo‘yicha o‘rtacha · eng arzon{" "}
                <b>{bestCpl != null ? money(bestCpl) : "N/A"}</b>
              </>
            }
            note="Sarf ÷ murojaatlar soni. Kam bo‘lsa — arzonroq mijoz."
            foot={
              <span>
                Video ko‘rish:{" "}
                <Term id="videoViews">{compact(totals.videoViews)}</Term>
              </span>
            }
          />
        </div>
        <div className="col-4">
          <KpiCard
            label={
              <>
                <Term id="ctr">Bosish ulushi</Term> <i>(CTR)</i>
              </>
            }
            value={pct(totals.ctr)}
            tone="var(--warn)"
            sub={
              <>
                <b>{whole(totals.clicks)}</b> ta bosish ·{" "}
                <b>{whole(totals.linkClicks)}</b> ta havola bosish
              </>
            }
            note="Ko‘rganlarning necha foizi bosgan — reklama matni/rasmi qiziqtirganini ko‘rsatadi."
            foot={<span>Havola bosish ulushi: {pct(totals.linkCtr)}</span>}
          />
        </div>
        <div className="col-4">
          <KpiCard
            label={
              <>
                <Term id="cpm">1000 ko‘rsatuv narxi</Term> <i>(CPM)</i>
              </>
            }
            value={money(totals.cpm)}
            tone="var(--good)"
            sub={
              <>
                Bosish narxi (CPC) <b>{money(totals.cpc)}</b>
              </>
            }
            note="Reklamani 1000 marta ko‘rsatish narxi — auditoriya qimmat yoki arzonligini ko‘rsatadi."
            foot={<span>Takroriylik: {ratio(totals.frequency)}</span>}
          />
        </div>
        <div className="col-4">
          <KpiCard
            label={
              <>
                <Term id="reach">Qamrov</Term> <i>(Reach)</i>
              </>
            }
            value={whole(totals.reach)}
            tone="var(--risk)"
            sub={
              <>
                Noyob odamlar · <b>{compact(totals.impressions)}</b> ta
                ko‘rsatuv
              </>
            }
            note="Reklamani ko‘rgan takrorsiz odamlar soni."
            foot={<span>Eng faol yosh: {bestAge?.age ?? "—"}</span>}
          />
        </div>
      </div>

      {/* Insights */}
      <Panel
        kicker="Tayyor xulosa"
        title="Raqamlar nima deyapti?"
        sub="Har bir xulosa shu sahifadagi real raqamlardan avtomatik hisoblanadi — yangi ma’lumot tushganda o‘zi yangilanadi"
        style={{ marginBottom: 14 }}
      >
        <div className="grid-12" style={{ gap: 11 }}>
          {insights.map(insight => (
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
            kicker="Diqqat"
            title="Nimaga e’tibor berish kerak"
            sub="Quyidagi holatlar raqamlar bo‘yicha avtomatik aniqlangan. Qatorni bossangiz — kampaniya ochiladi"
            action={
              <span className="chip muted">{alerts.length} ta holat</span>
            }
          >
            {alerts.length === 0 && (
              <div className="empty-state">
                Muammo topilmadi — hammasi me’yorida
              </div>
            )}
            {alerts.slice(0, 5).map(a => (
              <button
                key={a.id}
                className="sig-row"
                onClick={() =>
                  a.target?.kind === "campaign"
                    ? openCampaign(a.target.id)
                    : a.target?.kind === "creative"
                      ? openCreative(a.target.id)
                      : undefined
                }
              >
                <span
                  className={`chip ${SEVERITY_META[a.severity].chip}`}
                  style={{
                    flex: "none",
                    minWidth: 64,
                    justifyContent: "center",
                  }}
                >
                  {SEVERITY_META[a.severity].label}
                </span>
                <span style={{ minWidth: 0 }}>
                  <b>{a.title}</b>
                  <small>{a.body}</small>
                </span>
                {(a.target?.kind === "campaign" ||
                  a.target?.kind === "creative") && (
                  <ArrowUpRight
                    size={14}
                    style={{ flex: "none", color: "var(--text-3)" }}
                  />
                )}
              </button>
            ))}
            {anomalies.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px dashed var(--line)",
                }}
              >
                <span
                  className="kicker"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Radar size={12} /> Boshqalardan keskin farq qiladigan
                  kampaniyalar
                </span>
                {anomalies.slice(0, 3).map((an, i) => (
                  <button
                    key={`${an.campaignId}-${an.metric}-${i}`}
                    className="sig-row"
                    onClick={() => openCampaign(an.campaignId)}
                  >
                    <span
                      className={`chip ${an.direction === "high" ? "warn" : "accent"}`}
                      style={{
                        flex: "none",
                        minWidth: 64,
                        justifyContent: "center",
                      }}
                    >
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
                    <ArrowUpRight
                      size={14}
                      style={{ flex: "none", color: "var(--text-3)" }}
                    />
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
        <div className="col-5">
          <Panel
            kicker="Sarf sur’ati"
            title="Shu ketishda oy oxiriga qancha bo‘ladi?"
            sub={pacing?.daysNote}
          >
            {pacing && (
              <>
                <div className="pace-grid">
                  <div>
                    <small>Kunlik sarf</small>
                    <b>{money(pacing.dailySpend)}</b>
                  </div>
                  <div>
                    <small>Kunlik murojaat</small>
                    <b>{pacing.dailyLeads.toFixed(1)}</b>
                  </div>
                  <div>
                    <small>30 kunlik prognoz — sarf</small>
                    <b>{money(pacing.projected30Spend)}</b>
                  </div>
                  <div>
                    <small>30 kunlik prognoz — murojaat</small>
                    <b>{whole(pacing.projected30Leads)}</b>
                  </div>
                </div>
                {pacing.scale && (
                  <div className="what-if">
                    <span className="kicker">Agar byudjetni oshirsak</span>
                    <p>
                      «{pacing.scale.name}» kampaniyasida bitta murojaat{" "}
                      {money(pacing.scale.cpl)} turibdi —{" "}
                      <b>
                        qo‘shimcha $100 sarflansa, taxminan +
                        {pacing.scale.extraLeadsPer100} ta murojaat keladi
                      </b>
                      . Murojaat sifati CRM’da tasdiqlansa, byudjetni shu yerga
                      ko‘paytirish ma’qul.
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
              kicker="AmoCRM · murojaatdan bitimgacha"
              title="Reklama haqiqatan bitim olib keldimi?"
              action={
                <Link className="panel-link" href="/pipeline">
                  Lifecycle doskasini ochish <ArrowUpRight size={12} />
                </Link>
              }
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 9,
                }}
              >
                {[
                  {
                    l: "Murojaatlar",
                    v: whole(crmSummary.totalLeads),
                    c: "var(--accent)",
                  },
                  {
                    l: "Jarayonda",
                    v: whole(crmSummary.inProgress),
                    c: "var(--text-2)",
                  },
                  {
                    l: "Bitim bo‘ldi",
                    v: whole(crmSummary.won),
                    c: "var(--good)",
                  },
                  {
                    l: "Bekor bo‘ldi",
                    v: whole(crmSummary.lost),
                    c: "var(--risk)",
                  },
                  {
                    l: "Yutuq ulushi",
                    v:
                      crmSummary.winRate != null
                        ? pct(crmSummary.winRate, 1)
                        : "N/A",
                    c: "var(--cyan)",
                  },
                  {
                    l: "Tushum",
                    v: `${compact(crmSummary.revenue)} ${crm.currency}`,
                    c: "var(--good)",
                  },
                  {
                    l: "Bitim tannarxi",
                    v:
                      crmSummary.costPerWon != null
                        ? money(crmSummary.costPerWon)
                        : "N/A",
                    c: "var(--violet)",
                  },
                  {
                    l: "Qaytim (ROAS)",
                    v:
                      crmSummary.roas != null
                        ? `${crmSummary.roas.toFixed(1)}×`
                        : "N/A",
                    c:
                      (crmSummary.roas ?? 0) >= 1
                        ? "var(--good)"
                        : "var(--risk)",
                  },
                ].map(k => (
                  <div key={k.l} className="mini-stat">
                    <small>{k.l}</small>
                    <b style={{ color: k.c }}>{k.v}</b>
                  </div>
                ))}
              </div>
              <div className="note-strip" style={{ marginTop: 11 }}>
                <span className="kicker" style={{ flex: "none" }}>
                  Bog‘lanish
                </span>
                <span>
                  {crm.matchedLeads} ta murojaatdan {crm.leads.length} tasi{" "}
                  <Term id="utm">UTM belgisi</Term> orqali aniq kampaniyaga
                  bog‘landi. Bog‘lanmaganlari taxminiy hisobga qo‘shilmagan —{" "}
                  <Link
                    className="panel-link"
                    href="/pipeline"
                    style={{ display: "inline-flex" }}
                  >
                    batafsil
                  </Link>
                  .
                </span>
              </div>
            </Panel>
          ) : (
            <Panel
              kicker="AmoCRM ulanmagan"
              title="Keyingi qadam: murojaat emas — bitimni ko‘rish"
              action={
                <Link className="panel-link" href="/pipeline">
                  Qanday ulanadi <ArrowUpRight size={12} />
                </Link>
              }
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: "var(--text-2)",
                  lineHeight: 1.6,
                }}
              >
                AmoCRM ulanganda (amo_*.json fayli tushganda) shu panelda yutuq
                ulushi, tushum, bitim tannarxi va qaytim (ROAS) paydo bo‘ladi —
                har bir murojaat o‘z kampaniyasiga UTM orqali bog‘lanadi. Buning
                uchun tayyor sahifa bor: <b>“Murojaat yo‘li”</b> bo‘limida doska
                va manba tahlili kutib turibdi.
              </p>
            </Panel>
          )}
        </div>
      </div>

      {/* Funnel + spend */}
      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-5">
          <Panel
            kicker="Yo‘l: ko‘rishdan murojaatgacha"
            title="Qayerda odam yo‘qotilmoqda?"
            sub="Har qadamda oldingisiga nisbatan qolganlar ulushi"
          >
            <Funnel
              stages={[
                {
                  key: "imp",
                  label: "Ko‘rsatuvlar",
                  note: "reklama ekranga chiqdi",
                  value: totals.impressions,
                  tone: "var(--accent)",
                },
                {
                  key: "reach",
                  label: "Qamrov",
                  note: "takrorsiz odamlar",
                  value: totals.reach ?? 0,
                  tone: "var(--accent)",
                },
                {
                  key: "clicks",
                  label: "Bosishlar",
                  note: "hamma turdagi bosish",
                  value: totals.clicks,
                  tone: "var(--cyan)",
                },
                {
                  key: "link",
                  label: "Havola bosishlar",
                  note: "saytga o‘tish",
                  value: totals.linkClicks,
                  tone: "var(--cyan)",
                },
                {
                  key: "lpv",
                  label: "Sahifaga o‘tish",
                  note: "sahifa ochildi",
                  value: totals.landingPageViews ?? 0,
                  tone: "var(--violet)",
                },
                {
                  key: "leads",
                  label: "Murojaatlar",
                  note: "yakuniy natija",
                  value: totals.leads,
                  tone: "var(--good)",
                },
              ]}
            />
          </Panel>
        </div>
        <div className="col-7">
          <Panel
            kicker="Byudjet taqsimoti"
            title="Pul qaysi kampaniyaga ketdi?"
            sub="Eng ko‘p sarflangan 9 ta kampaniya"
            action={
              <Link className="panel-link" href="/campaigns">
                Barcha kampaniyalar <ArrowUpRight size={12} />
              </Link>
            }
          >
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
            <Panel
              kicker="Qiziqish reytingi"
              title="Auditoriya qanday javob berdi?"
              sub="Reaksiya, komment, saqlash va bosishlar yig‘indisi bo‘yicha eng faol 5 ta kampaniya"
            >
              <div className="tbl-wrap">
                <table className="tbl" style={{ minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th>Kampaniya</th>
                      <th>
                        Interaksiya<small>engagement</small>
                      </th>
                      <th>Reaksiya</th>
                      <th>Izoh</th>
                      <th>Saqlash</th>
                      <th>
                        Qiziqish foizi<small>eng. rate</small>
                      </th>
                      <th>Sarf / inter.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {engagement.top.map(c => {
                      const er = c.metrics.impressions
                        ? ((c.metrics.postEngagement ?? 0) /
                            c.metrics.impressions) *
                          100
                        : null;
                      const cpe = c.metrics.postEngagement
                        ? c.metrics.spend / c.metrics.postEngagement
                        : null;
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
                          <td className="num">
                            {whole(c.metrics.reactions ?? 0)}
                          </td>
                          <td className="num">
                            {whole(c.metrics.comments ?? 0)}
                          </td>
                          <td className="num">{whole(c.metrics.saves ?? 0)}</td>
                          <td className="num">
                            {er != null ? pct(er, 2) : "N/A"}
                          </td>
                          <td className="num">
                            {cpe != null ? `$${cpe.toFixed(3)}` : "N/A"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
          <div className="col-5">
            <Panel kicker="Video va yozishmalar" title="Chuqurroq jalb qilish">
              <div className="pace-grid">
                <div>
                  <small>
                    <Video
                      size={10}
                      style={{ display: "inline", marginRight: 4 }}
                    />{" "}
                    Video ko‘rish (30 s)
                  </small>
                  <b>{compact(engagement.videoViews)}</b>
                </div>
                <div>
                  <small>Sarf / video ko‘rish</small>
                  <b>
                    {engagement.videoViews
                      ? money(totals.spend / engagement.videoViews)
                      : "N/A"}
                  </b>
                </div>
                <div>
                  <small>
                    <MessageSquare
                      size={10}
                      style={{ display: "inline", marginRight: 4 }}
                    />{" "}
                    Yozishma boshlandi
                  </small>
                  <b>{whole(engagement.messaging)}</b>
                </div>
                <div>
                  <small>Javob olingan yozishmalar</small>
                  <b>
                    {engagement.messaging
                      ? `${whole(engagement.firstReply)} (${pct((engagement.firstReply / engagement.messaging) * 100, 0)})`
                      : "N/A"}
                  </b>
                </div>
              </div>
              <div className="what-if" style={{ marginTop: 11 }}>
                <span className="kicker">Hisob</span>
                <p>
                  Jami <b>{whole(engagement.postEngagement)}</b> post
                  interaksiyasi: <b>{whole(engagement.reactions)}</b> reaksiya ·{" "}
                  <b>{whole(engagement.comments)}</b> komment ·{" "}
                  <b>{whole(engagement.saves)}</b> saqlash. Har bir interaksiya
                  uchun o'rtacha{" "}
                  <b>{money(totals.spend / engagement.postEngagement)}</b> sarf.
                  {engagement.messaging > 0 && engagement.firstReply > 0 && (
                    <>
                      {" "}
                      Messaging kanalida suhbatlarning{" "}
                      <b>
                        {pct(
                          (engagement.firstReply / engagement.messaging) * 100,
                          0
                        )}
                      </b>{" "}
                      javob olgan — qolganlari javobsiz qolgan.
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
          <Panel
            kicker="Samaradorlik"
            title="Murojaat soni va narxi yonma-yon"
            sub="Murojaat bergan kampaniyalar: ustunlar — murojaat soni, chiziq — bitta murojaat narxi"
          >
            <div style={{ height: 286 }}>
              <LeadsCplChart data={cplChart} />
            </div>
          </Panel>
        </div>
        <div className="col-5">
          <Panel
            kicker="Eng yaxshi kreativ"
            title="Qaysi reklama eng ko‘p ishladi?"
          >
            {topCreative ? (
              <div
                className="creative-card"
                style={{ background: "var(--panel-2)" }}
              >
                <div className="c-top">
                  <span className="rank-badge">01</span>
                  <div className="c-name">
                    <b>{topCreative.originalName}</b>
                    <small>{topCreative.adset?.originalName ?? "—"}</small>
                  </div>
                </div>
                <div className="c-stats">
                  <div>
                    <small>Sarf</small>
                    <b>{money(topCreative.metrics.spend)}</b>
                  </div>
                  <div>
                    <small>Ko‘rsatuv</small>
                    <b>{compact(topCreative.metrics.impressions)}</b>
                  </div>
                  <div>
                    <small>Bosish</small>
                    <b>{whole(topCreative.metrics.clicks)}</b>
                  </div>
                  <div>
                    <small>Bosish ulushi</small>
                    <b>{pct(topCreative.metrics.ctr)}</b>
                  </div>
                  {topCreative.hasLeads && (
                    <>
                      <div>
                        <small>Murojaat</small>
                        <b style={{ color: "var(--cyan)" }}>
                          {whole(topCreative.metrics.leads)}
                        </b>
                      </div>
                      <div>
                        <small>Murojaat narxi</small>
                        <b style={{ color: "var(--good)" }}>
                          {money(topCreative.metrics.cpl)}
                        </b>
                      </div>
                    </>
                  )}
                </div>
                <button
                  className="primary-btn"
                  onClick={() => openCreative(topCreative.id)}
                >
                  Kreativ tafsilotlari <ArrowUpRight size={13} />
                </button>
              </div>
            ) : (
              <div className="empty-state">Kreativ ma’lumoti topilmadi</div>
            )}
            {topCreative && !topCreative.hasLeads && (
              <div style={{ marginTop: 12 }}>
                <span className="kicker">
                  Nima uchun murojaat ko‘rsatilmagan
                </span>
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-2)",
                    margin: "6px 0 0",
                    lineHeight: 1.6,
                  }}
                >
                  Bu kreativ bo‘yicha Meta murojaat sonini alohida qaytarmagan —
                  shuning uchun samaradorlik sarf va bosish ulushi orqali
                  o‘lchanadi. Murojaat darajasidagi xulosa kampaniya kesimida
                  beriladi.
                </p>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
