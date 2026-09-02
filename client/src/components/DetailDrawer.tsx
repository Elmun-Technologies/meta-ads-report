import { ArrowUpRight, X } from "lucide-react";
import { useLocation } from "wouter";
import { money, pct, ratio, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { EmptyState } from "./widgets";

export function DetailDrawer() {
  const { drawer, closeDrawer, snapshot, openCreative, openCampaign } = useDashboardContext();
  const [, navigate] = useLocation();
  if (!drawer || !snapshot) return null;

  const campaign = drawer.type === "campaign" ? snapshot.campaigns.find((c) => c.id === drawer.id) : null;
  const creative = drawer.type === "creative" ? snapshot.creatives.find((c) => c.id === drawer.id) : campaign?.creatives.find((c) => c.id === drawer.id);
  const isCreative = Boolean(creative);
  const row = creative ?? campaign;
  if (!row) return <EmptyState text="Ma'lumot topilmadi" />;

  const m = row.metrics;
  const bestCpl = snapshot.campaigns.filter((c) => c.metrics.cpl != null).reduce((best, c) => ((c.metrics.cpl ?? 9e9) < (best.metrics.cpl ?? 9e9) ? c : best), snapshot.campaigns[0]);
  const cplTone = !m.cpl ? "tone-muted" : (m.cpl ?? 0) <= (snapshot.totals.cpl ?? 0) ? "tone-good" : (m.cpl ?? 0) <= (snapshot.totals.cpl ?? 0) * 1.5 ? "tone-warn" : "tone-risk";

  return (
    <>
      <div className="drawer-backdrop" onClick={closeDrawer} />
      <aside className="drawer">
        <div className="d-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <span className="kicker">{isCreative ? "KREATIV TAFSILOTI" : campaign ? "KAMPANIYA TAFSILOTI" : "TAFSILOT"}</span>
            <h2>{isCreative ? creative!.name : campaign!.name}</h2>
            <div className="d-orig">Original: {isCreative ? creative!.originalName : campaign!.originalName}</div>
          </div>
          <button className="icon-btn" onClick={closeDrawer} aria-label="Yopish">
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
          {isCreative ? (
            <>
              <span className="chip accent">{creative!.effectiveStatus ?? "—"}</span>
              <span className="chip muted">{creative!.adset ? creative!.adset.name.split(" | ")[0] : "AD SET N/A"}</span>
            </>
          ) : (
            <>
              <span className={`chip ${m.leads > 0 ? "good" : "muted"}`}>{m.leads > 0 ? "LEAD KAMPANIYA" : "LEAD QAYTMADI"}</span>
              <span className="chip muted">{campaign!.expo}</span>
              {campaign!.objective && <span className="chip muted">{String(campaign!.objective).replace(/_/g, " ").toUpperCase()}</span>}
            </>
          )}
          <span className="chip muted">{snapshot.meta.period.label || snapshot.meta.period.start}</span>
        </div>

        <div className="d-stats">
          <div>
            <small>Spend</small>
            <b>{money(m.spend)}</b>
          </div>
          <div>
            <small>{isCreative ? "Leads (ad level)" : "Leads"}</small>
            <b className={isCreative && !creative!.hasLeads ? "tone-muted" : ""}>{isCreative ? (creative!.hasLeads ? whole(m.leads) : "N/A") : whole(m.leads)}</b>
          </div>
          <div>
            <small>Cost per lead</small>
            <b className={cplTone}>{m.cpl != null ? money(m.cpl) : "N/A"}</b>
          </div>
          <div>
            <small>CTR</small>
            <b>{pct(m.ctr)}</b>
          </div>
        </div>

        <div className="d-section">
          <span className="kicker">ASOSIY KO'RSATKICHLAR</span>
          <div className="d-kv">
            <span>Impressions</span>
            <b>{whole(m.impressions)}</b>
          </div>
          <div className="d-kv">
            <span>Reach</span>
            <b>{m.reach != null ? whole(m.reach) : "N/A"}</b>
          </div>
          <div className="d-kv">
            <span>Frequency</span>
            <b>{ratio(m.frequency)}</b>
          </div>
          <div className="d-kv">
            <span>Clicks (all)</span>
            <b>{whole(m.clicks)}</b>
          </div>
          <div className="d-kv">
            <span>Link clicks</span>
            <b>{whole(m.linkClicks)}</b>
          </div>
          <div className="d-kv">
            <span>Link CTR</span>
            <b>{pct(m.linkCtr)}</b>
          </div>
          <div className="d-kv">
            <span>CPC</span>
            <b>{money(m.cpc)}</b>
          </div>
          <div className="d-kv">
            <span>CPM</span>
            <b>{money(m.cpm)}</b>
          </div>
          {m.landingPageViews != null && (
            <div className="d-kv">
              <span>Landing page views</span>
              <b>{whole(m.landingPageViews)}</b>
            </div>
          )}
          {m.messagingConversations != null && (
            <div className="d-kv">
              <span>Messaging conversations</span>
              <b>{whole(m.messagingConversations)}</b>
            </div>
          )}
        </div>

        {!isCreative && campaign && (
          <div className="d-section">
            <span className="kicker">TAHLILIY XULOSA</span>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.65, color: "var(--text-2)" }}>
              {m.leads > 0 ? (
                <>
                  Bu kampaniya <b style={{ color: "var(--text)" }}>{whole(m.leads)} lead</b> berdi — {money(m.cpl)} har bir lead uchun. Account o'rtacha CPL {money(snapshot.totals.cpl)}
                  {(m.cpl ?? 0) < (snapshot.totals.cpl ?? 0) ? " (bu kampaniya arzonroq)" : " (bu kampaniya qimmatroq)"}. Eng arzon manba: «{bestCpl?.originalName}» ({money(bestCpl?.metrics.cpl)}). Keyingi qadam — CRM dagi lead sifatini tekshirish.
                </>
              ) : (
                <>Tanlangan davrda bu kampaniyadan lead action qaytmadi. Objective va pixel/event setupini tekshiring — sarf ({money(m.spend)}) natijasiz ketyapti.</>
              )}
            </p>
          </div>
        )}

        {!isCreative && campaign && campaign.creatives.length > 0 && (
          <div className="d-section">
            <span className="kicker">KREATIVLAR ({campaign.creatives.length})</span>
            {campaign.creatives.map((cr, i) => (
              <button
                key={`${cr.id}-${i}`}
                onClick={() => openCreative(cr.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 8px", borderRadius: 10, transition: "background .14s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--panel-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span className="rank-badge" style={{ width: 22, height: 22, borderRadius: 7, fontSize: 10, background: `color-mix(in srgb, var(--accent) ${Math.max(90 - i * 12, 30)}%, transparent)` }}>
                  {i + 1}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ display: "block", fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cr.originalName}</b>
                  <small style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-3)" }}>{cr.adset?.originalName ?? "—"}</small>
                </span>
                <span className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>
                  {money(cr.metrics.spend)}
                </span>
                <ArrowUpRight size={13} style={{ color: "var(--text-3)" }} />
              </button>
            ))}
          </div>
        )}

        {isCreative && creative && (
          <div className="d-section">
            <span className="kicker">KONTEKST</span>
            <div className="d-kv">
              <span>Kampaniya</span>
              <button className="panel-link" onClick={() => openCampaign(creative.campaignId)} style={{ fontSize: 11 }}>
                {snapshot.campaigns.find((c) => c.id === creative.campaignId)?.originalName ?? creative.campaignId}
              </button>
            </div>
            <div className="d-kv">
              <span>AD SET (original)</span>
              <b>{creative.adset?.originalName ?? "N/A"}</b>
            </div>
            <div className="d-kv">
              <span>Status</span>
              <b>{creative.effectiveStatus ?? "N/A"}</b>
            </div>
            {creative.createdTime && (
              <div className="d-kv">
                <span>Yaratilgan</span>
                <b>{new Date(creative.createdTime).toLocaleDateString("uz-UZ")}</b>
              </div>
            )}
          </div>
        )}

        <button
          className="primary-btn"
          style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
          onClick={() => {
            if (isCreative && creative) navigate(`/campaigns?focus=${creative.campaignId}`);
            else if (campaign) navigate(`/campaigns?focus=${campaign.id}`);
            closeDrawer();
          }}
        >
          Kampaniyalar jadvalida ko'rish <ArrowUpRight size={14} />
        </button>
      </aside>
    </>
  );
}
