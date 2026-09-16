import { useMemo } from "react";
import { Link } from "wouter";
import {
  ArrowUpRight,
  MessageSquare,
  Radio,
  RefreshCw,
  Video,
  Zap,
} from "lucide-react";
import { PLATFORM_META, type ActivityEvent, type CampaignNode, type PlatformTotals } from "@shared/types";
import { buildAlerts, buildPacing, SEVERITY_META } from "@/lib/alerts";
import { buildCrmSummary } from "@shared/amo";
import { ago, compact, money, pct, ratio, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { Funnel, KpiCard, Panel, SpendShare } from "@/components/widgets";
import { PageHint } from "@/components/Help";
import {
  DailyTrendChart,
  LeadsCplChart,
  SpendByCampaignChart,
} from "@/components/charts";

const shorten = (name: string, max = 22) =>
  name.length > max ? `${name.slice(0, max - 1)}…` : name;

/* ------------------------------------------------------------------ */
/* Platformalar kesimi — pul qaysi kanalga ketayapti                    */
/* ------------------------------------------------------------------ */

function PlatformBreakdown({ platforms }: { platforms: PlatformTotals[] }) {
  const connected = platforms.filter(p => p.spend > 0 || p.campaigns > 0);
  const totalSpend = connected.reduce((s, p) => s + p.spend, 0);
  const totalLeads = connected.reduce((s, p) => s + p.leads, 0);

  return (
    <Panel
      kicker="Yagona oyna · platformalar kesimi"
      title="Pul qaysi kanalga ketayapti?"
      sub="Barcha marketing manbalari bir joyda: har bir platformaning sarfi, murojaatlari va narxi"
      action={
        <Link className="panel-link" href="/connections">
          Ulanishlar <ArrowUpRight size={12} />
        </Link>
      }
    >
      {/* Sarf ulushi — stacked bar */}
      {totalSpend > 0 && (
        <div
          className="plat-bar"
          style={{
            display: "flex",
            height: 10,
            borderRadius: 6,
            overflow: "hidden",
            marginBottom: 12,
            background: "var(--panel-2)",
          }}
        >
          {connected.map(p => (
            <div
              key={p.platform}
              title={`${p.name}: ${money(p.spend)}`}
              style={{
                width: `${(p.spend / totalSpend) * 100}%`,
                background: p.color,
                minWidth: p.spend > 0 ? 4 : 0,
              }}
            />
          ))}
        </div>
      )}

      <div className="tbl-wrap">
        <table className="tbl" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>Platforma</th>
              <th>Sarf</th>
              <th>Ulush</th>
              <th>Murojaat</th>
              <th>Murojaat narxi</th>
              <th>Bosish ulushi</th>
              <th>Ma'lumot qamrovi</th>
            </tr>
          </thead>
          <tbody>
            {platforms.map(p => {
              const share = totalSpend > 0 ? (p.spend / totalSpend) * 100 : 0;
              const isEmpty = p.spend === 0 && p.campaigns === 0;
              return (
                <tr key={p.platform} className={isEmpty ? "row-muted" : ""}>
                  <td>
                    <div className="cell-name">
                      <span
                        className="p-dot"
                        style={{
                          background: p.color,
                          width: 18,
                          height: 18,
                          borderRadius: 6,
                          flex: "none",
                        }}
                      />
                      <span className="n">
                        <b>{p.name}</b>
                        <small>
                          {isEmpty
                            ? "ulanmagan"
                            : `${p.campaigns} kampaniya · ${p.syncedAt ? ago(p.syncedAt) : "—"}`}
                        </small>
                      </span>
                      {p.autoSync && (
                        <span
                          className="chip good"
                          title="Sync dvigateli bu manbadan avtomatik tortadi"
                          style={{ marginLeft: 6 }}
                        >
                          auto
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {p.spend > 0 ? money(p.spend) : "—"}
                  </td>
                  <td className="num">
                    {totalSpend > 0 && p.spend > 0 ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {pct(share, 1)}
                        <SpendShare share={share / 100} />
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">{p.leads > 0 ? whole(p.leads) : "—"}</td>
                  <td className="num">
                    {p.cpl != null && p.cpl > 0 ? money(p.cpl) : "—"}
                  </td>
                  <td className="num">{p.ctr != null ? pct(p.ctr, 2) : "—"}</td>
                  <td>
                    <span
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        maxWidth: 220,
                      }}
                    >
                      {p.coverage.length > 0 ? (
                        p.coverage.map(c => (
                          <span key={c} className="chip muted" style={{ fontSize: 9.5 }}>
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="tone-muted" style={{ fontSize: 11 }}>
                          ma'lumot yo'q
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontWeight: 700 }}>Jami</td>
              <td className="num" style={{ fontWeight: 700 }}>
                {money(totalSpend)}
              </td>
              <td className="num">100%</td>
              <td className="num" style={{ fontWeight: 700 }}>
                {whole(totalLeads)}
              </td>
              <td className="num" style={{ fontWeight: 700 }}>
                {totalLeads > 0 ? money(totalSpend / totalLeads) : "—"}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Jonli harakat — real-time hodisalar                                  */
/* ------------------------------------------------------------------ */

const ACTIVITY_ICON: Record<string, typeof Zap> = {
  sync: RefreshCw,
  snapshot: RefreshCw,
  lead: Zap,
  stage: ArrowUpRight,
  channel: Radio,
  webhook: Radio,
  manual: RefreshCw,
  error: ArrowUpRight,
};

function LiveActivity({
  events,
  nextSyncAt,
  intervalSec,
}: {
  events: ActivityEvent[];
  nextSyncAt: string | null | undefined;
  intervalSec: number | undefined;
}) {
  return (
    <Panel
      kicker="Jonli harakat"
      title="Hoziroq nima bo'ldi?"
      sub="Sync, yangi murojaatlar va webhooklar — serverdan real-time (SSE)"
      action={
        nextSyncAt ? (
          <span className="chip muted" title="Keyingi rejalashtirilgan sinxronlash">
            <RefreshCw size={10} style={{ marginRight: 4 }} />
            keyingi sync: {ago(nextSyncAt).replace(" oldin", "")}dan keyin
          </span>
        ) : (
          <span className="chip muted">har {Math.round((intervalSec ?? 300) / 60)} daqiqada</span>
        )
      }
    >
      {events.length === 0 ? (
        <div className="empty-state">
          Hozircha hodisa yo'q. Manbalar ulangach (yoki "Yangilash" bossangiz)
          sync natijalari shu yerda real-time ko'rinadi.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {events.slice(0, 9).map(ev => {
            const Icon = ACTIVITY_ICON[ev.kind] ?? Zap;
            const tone =
              ev.tone === "good"
                ? "var(--good)"
                : ev.tone === "warn"
                  ? "var(--warn)"
                  : ev.tone === "risk"
                    ? "var(--risk)"
                    : "var(--text-3)";
            return (
              <div
                key={ev.id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "7px 0",
                  borderBottom: "1px solid var(--line)",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    color: tone,
                    flex: "none",
                    marginTop: 2,
                  }}
                >
                  <Icon size={13} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 12, display: "block" }}>{ev.title}</b>
                  {ev.body && (
                    <small
                      style={{
                        color: "var(--text-3)",
                        fontSize: 11,
                        display: "block",
                        lineHeight: 1.45,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={ev.body}
                    >
                      {ev.body}
                    </small>
                  )}
                </span>
                <span
                  className="mono tone-muted"
                  style={{ fontSize: 10, flex: "none", marginTop: 2 }}
                >
                  {ago(ev.at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Overview sahifasi                                                    */
/* ------------------------------------------------------------------ */

export default function Overview() {
  const { snapshot, crm, crmConnected, openCampaign, openCreative, activity, syncState } =
    useDashboardContext();

  const alerts = useMemo(
    () => (snapshot ? buildAlerts(snapshot) : []),
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
  const platforms = snapshot.platforms ?? null;
  const daily = snapshot.daily ?? null;

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
            Kabinet {snapshot.meta.account.name}: {campaigns.length} kampaniya,{" "}
            {creatives.length} kreativ, {whole(totals.impressions)} ko'rsatuv.
            Barcha raqamlar {snapshot.meta.sourceLabel} manbasidan olingan —
            taxminiy hisob yo'q.
          </p>
        </div>
        <div className="right">
          <span className="chip good">
            <i /> Ma'lumot ulangan
          </span>
          <span className="chip muted">
            Valyuta {snapshot.meta.account.currency}
          </span>
        </div>
      </div>

      <PageHint>
        Oltita asosiy ko'rsatkich, diqqat talab qiladigan kampaniyalar va
        murojaatlar voronkasi — hammasi bitta sahifada.
      </PageHint>

      {/* KPI ledger */}
      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-4">
          <KpiCard
            label={
              <>
                Sarf <i>(Spend)</i>
              </>
            }
            value={money(totals.spend)}
            sub={
              <>
                Umumiy sarf · <b>{campaigns.length}</b> kampaniya bo'yicha
              </>
            }
            foot={
              <>
                <span>
                  Maksimal: {money(campaigns[0]?.metrics.spend ?? 0)}
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
                Murojaatlar <i>(Leads)</i>
              </>
            }
            value={whole(totals.leads)}
            tone="var(--cyan)"
            sub={
              <>
                Murojaat bergan kampaniyalar:{" "}
                <b>{campaigns.filter(c => c.metrics.leads > 0).length}</b> /{" "}
                {campaigns.length}
              </>
            }
            foot={<span>Bittasidan maksimum: {whole(maxLeads)}</span>}
          />
        </div>
        <div className="col-4">
          <KpiCard
            label={
              <>
                Murojaat narxi <i>(CPL)</i>
              </>
            }
            value={money(totals.cpl)}
            tone="var(--violet)"
            sub={
              <>
                Hisob bo'yicha o'rtacha · eng arzoni{" "}
                <b>{bestCpl != null ? money(bestCpl) : "N/A"}</b>
              </>
            }
            foot={
              <span>
                Video ko'rish: {compact(totals.videoViews)}
              </span>
            }
          />
        </div>
        <div className="col-4">
          <KpiCard
            label={
              <>
                Bosish ulushi <i>(CTR)</i>
              </>
            }
            value={pct(totals.ctr)}
            tone="var(--warn)"
            sub={
              <>
                <b>{whole(totals.clicks)}</b> bosish ·{" "}
                <b>{whole(totals.linkClicks)}</b> havola bosish
              </>
            }
            foot={<span>Havola CTR: {pct(totals.linkCtr)}</span>}
          />
        </div>
        <div className="col-4">
          <KpiCard
            label={
              <>
                1000 ko'rsatuv narxi <i>(CPM)</i>
              </>
            }
            value={money(totals.cpm)}
            tone="var(--good)"
            sub={
              <>
                Bosish narxi (CPC) <b>{money(totals.cpc)}</b>
              </>
            }
            foot={<span>Takroriylik: {ratio(totals.frequency)}</span>}
          />
        </div>
        <div className="col-4">
          <KpiCard
            label={
              <>
                Qamrov <i>(Reach)</i>
              </>
            }
            value={whole(totals.reach)}
            tone="var(--risk)"
            sub={
              <>
                Noyob odamlar · <b>{compact(totals.impressions)}</b> ko'rsatuv
              </>
            }
            foot={<span>Eng faol yosh: {bestAge?.age ?? "—"}</span>}
          />
        </div>
      </div>

      {/* Diqqat signallari + Pacing */}
      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-7">
          <Panel
            kicker="Diqqat"
            title="Nimaga e'tibor berish kerak?"
            sub="Quyidagi holatlar avtomatik aniqlandi. Qatorni bossangiz kampaniya ochiladi"
            action={
              <span className="chip muted">{alerts.length} ta signal</span>
            }
          >
            {alerts.length === 0 && (
              <div className="empty-state">
                Muammo topilmadi — hammasi me'yorida
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
          </Panel>
        </div>
        <div className="col-5">
          <Panel
            kicker="Sarf sur'ati"
            title="Shu tempda oy oxiriga qancha bo'ladi?"
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
              </>
            )}
          </Panel>
        </div>
      </div>

      {/* Yagona oyna: platformalar kesimi + jonli harakat */}
      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-8">{platforms && <PlatformBreakdown platforms={platforms} />}</div>
        <div className="col-4">
          <LiveActivity
            events={activity}
            nextSyncAt={syncState?.nextSyncAt}
            intervalSec={syncState?.intervalSec}
          />
        </div>
      </div>

      {/* Kunlik dinamika — real-time rejimda (time_increment=1) to'ladi */}
      {daily && daily.length > 1 && (
        <div className="grid-12" style={{ marginBottom: 14 }}>
          <div className="col-12">
            <Panel
              kicker="Kunlik dinamika"
              title="Sarf va murojaatlar qanday o'zgarmoqda?"
              sub={`Kunlik kesim (${daily[0].date} — ${daily[daily.length - 1].date}) — ustunlar sarf, chiziq murojaatlar soni`}
            >
              <div style={{ height: 250 }}>
                <DailyTrendChart data={daily} />
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* CRM lifecycle strip */}
      <div className="grid-12">
        <div className="col-12">
          {crmSummary && crm ? (
            <Panel
              kicker="AmoCRM · murojaatdan bitimgacha"
              title="Reklama haqiqiy bitim berdimi?"
              action={
                <Link className="panel-link" href="/pipeline">
                  Voronka doskasini ochish <ArrowUpRight size={12} />
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
                    l: "Bitim bo'ldi",
                    v: whole(crmSummary.won),
                    c: "var(--good)",
                  },
                  {
                    l: "Bekor bo'ldi",
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
                  Bog'lanish
                </span>
                <span>
                  {crm.leads.length} ta murojaatdan {crm.matchedLeads} tasi UTM
                  belgisi orqali aniq kampaniyaga bog'landi. Bog'lanmaganlari
                  taxminiy hisobga qo'shilmagan —{" "}
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
              title="Keyingi qadam: murojaat emas — bitimni ko'rish"
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
                AmoCRM ulanganda (amo_*.json fayli tushganda yoki{" "}
                <b>/api/webhooks/amocrm</b> webhook'i sozlanganda) shu panelda
                yutuq ulushi, tushum, bitim tannarxi va qaytim (ROAS) paydo
                bo'ladi — har bir murojaat o'z kampaniyasiga UTM orqali
                bog'lanadi, yangi leadlar esa <b>jonli harakat</b> panelida
                darhol ko'rinadi.
              </p>
            </Panel>
          )}
        </div>
      </div>

      {/* Voronka + sarf */}
      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-5">
          <Panel
            kicker="Yo'l: ko'rishdan murojaatgacha"
            title="Qayerda odam yo'qotilmoqda?"
            sub="Har qadamda oldingisiga nisbatan qolganlar ulushi"
          >
            <Funnel
              stages={[
                {
                  key: "imp",
                  label: "Ko'rsatuvlar",
                  value: totals.impressions,
                  tone: "var(--accent)",
                },
                {
                  key: "reach",
                  label: "Qamrov",
                  value: totals.reach ?? 0,
                  tone: "var(--accent)",
                },
                {
                  key: "clicks",
                  label: "Bosishlar",
                  value: totals.clicks,
                  tone: "var(--cyan)",
                },
                {
                  key: "link",
                  label: "Havola bosishlar",
                  value: totals.linkClicks,
                  tone: "var(--cyan)",
                },
                {
                  key: "lpv",
                  label: "Sahifaga o'tish",
                  value: totals.landingPageViews ?? 0,
                  tone: "var(--violet)",
                },
                {
                  key: "leads",
                  label: "Murojaatlar",
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
            sub="Eng ko'p sarflangan 9 ta kampaniya"
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
              sub="Reaksiya, komment, saqlash va bosishlar yig'indisi bo'yicha eng faol 5 ta kampaniya"
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
                    Video ko'rish (30 s)
                  </small>
                  <b>{compact(engagement.videoViews)}</b>
                </div>
                <div>
                  <small>Sarf / video ko'rish</small>
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
            </Panel>
          </div>
        </div>
      )}

      {/* Murojaat/CPL + top kreativ */}
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
            title="Qaysi reklama eng ko'p ishladi?"
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
                    <small>Ko'rsatuv</small>
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
              <div className="empty-state">Kreativ ma'lumoti topilmadi</div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
