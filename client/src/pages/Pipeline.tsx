import { useMemo, useState } from "react";
import { Building2, CircleDollarSign, Filter, Phone, Search, Timer, TrendingUp, User } from "lucide-react";
import type { CrmLead, CrmStage } from "@shared/types";
import { buildCrmSummary, buildSourceRows, buildStageFunnel } from "@shared/amo";
import { money, pct, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { EmptyState, KpiCard, Panel } from "@/components/widgets";

const stageTone = (kind: string) => (kind === "won" ? "var(--good)" : kind === "lost" ? "var(--risk)" : "var(--accent)");

function NotConnected() {
  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker" style={{ color: "var(--accent)" }}>
            LEAD LIFECYCLE · AMOCRM
          </span>
          <h1>Lead'gina emas — bitimgacha</h1>
          <p>Har bir lead qaysi reklamadan kelganini, AmoCRM'da qaysi bosqichda turganini, kim yutib kim yo'qolganini va qancha tushum berganini bitta joyda ko'ring.</p>
        </div>
      </div>
      <div className="grid-12">
        <div className="col-7">
          <Panel kicker="AMOCRM ULANISHI" title="Jarayon shu yerda davom etadi" sub="Ulangach quyidagilar avtomatik yonadi">
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                ["Skvoznaya voronka", "Impression → Lead → AmoCRM bosqichlari → Won/Lost, har qadamda konversiya va tannarx"],
                ["Kanban doska", "Har bosqichda kimlar turibdi: manba kampaniya, summa, mas'ul, bosqichda o'tirgan kuni"],
                ["Manba atributsiyasi", "Qaysi kampaniya/kreativ nechta YUTIQLI deal bergan — CPL emas, cost per WON"],
                ["ROAS", "Reklama sarfi vs yopilgan bitimlar summasi, kampaniya kesimida"],
              ].map(([t, d]) => (
                <div key={t} className="d-kv" style={{ alignItems: "flex-start" }}>
                  <span style={{ color: "var(--text-2)", minWidth: 170 }}>
                    <b style={{ color: "var(--text)" }}>{t}</b>
                  </span>
                  <span style={{ textAlign: "right", flex: 1 }}>{d}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="col-5">
          <Panel kicker="QANDAY ULANADI" title="3 qadam" sub="Manus/MCP yoki AmoCRM webhook">
            {[
              "AmoCRM'dan leadlar (uta_campaign bilan) + pipeline bosqichlari eksport qilinadi",
              "Fayl server/data/snapshots/amo_<hisob>_<davr>.json nomi bilan tushadi",
              "Dashboard utm_campaign bo'yicha Meta kampaniyalariga bog'laydi — sahifa o'zi ochiladi",
            ].map((s, i) => (
              <div key={s} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: "1px dashed var(--grid-line)" }}>
                <span className="rank-badge" style={{ width: 24, height: 24, borderRadius: 8, fontSize: 11, background: "var(--accent-soft)", color: "var(--accent)" }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55 }}>{s}</span>
              </div>
            ))}
            <div className="note-strip" style={{ marginTop: 12 }}>
              <span className="kicker" style={{ flex: "none" }}>
                FORMAT
              </span>
              <span className="mono" style={{ fontSize: 10 }}>
                amo_*.json — account, pipelines, stages, leads[] (utm_campaign, price, history)
              </span>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

export default function Pipeline() {
  const { snapshot, crm, crmConnected, openLead } = useDashboardContext();
  const [query, setQuery] = useState("");
  const [onlyWon, setOnlyWon] = useState(false);

  const summary = useMemo(() => (crm ? buildCrmSummary(crm, snapshot) : null), [crm, snapshot]);
  const funnel = useMemo(() => (crm ? buildStageFunnel(crm, snapshot) : []), [crm, snapshot]);
  const sources = useMemo(() => (crm ? buildSourceRows(crm, snapshot) : []), [crm, snapshot]);

  if (!crmConnected || !crm || !summary) return <NotConnected />;

  const cur = crm.currency;
  const curMoney = (v: number) => `${whole(v)} ${cur}`;
  const campaignOf = (lead: CrmLead) => (lead.campaignId ? snapshot?.campaigns.find((c) => c.id === lead.campaignId) : null);

  const filteredLeads = crm.leads.filter((l) => {
    const q = query.toLowerCase();
    const matchQ = !q || l.name.toLowerCase().includes(q) || (l.contactName ?? "").toLowerCase().includes(q) || (campaignOf(l)?.originalName ?? "").toLowerCase().includes(q);
    const isWon = crm.stages.find((s) => s.id === l.stageId)?.kind === "won";
    return matchQ && (!onlyWon || isWon);
  });

  const maxReached = Math.max(...funnel.map((f) => f.reached), 1);

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker" style={{ color: "var(--accent)" }}>
            LEAD LIFECYCLE · {crm.account.toUpperCase()}
          </span>
          <h1>Lead'gina emas — bitimgacha</h1>
          <p>
            {whole(crm.leads.length)} lead CRM'da · {crm.matchedLeads} tasi reklamaga bog'langan (UTM) · {crm.unmatchedLeads} tasi manbasiz. Har bir qadamning tannarxi va konversiyasi pastda.
          </p>
        </div>
        <div className="right">
          <span className="chip good">
            <i /> AMOCRM · ULANGAN
          </span>
        </div>
      </div>

      {/* KPI */}
      <div className="grid-12" style={{ marginBottom: 14 }}>
        <div className="col-4">
          <KpiCard label="Leads (CRM)" value={whole(summary.totalLeads)} icon={<User size={15} />} sub={<>Jarayonda <b>{summary.inProgress}</b> · yopilgan <b>{summary.won + summary.lost}</b></>} />
        </div>
        <div className="col-4">
          <KpiCard label="Yutiq / Yutqazish" value={`${summary.won} / ${summary.lost}`} tone="var(--good)" icon={<TrendingUp size={15} />} sub={<>Win rate <b>{summary.winRate != null ? pct(summary.winRate, 1) : "N/A"}</b></>} />
        </div>
        <div className="col-4">
          <KpiCard label="Tushum (won)" value={curMoney(summary.revenue)} tone="var(--cyan)" icon={<CircleDollarSign size={15} />} sub={<>Quvurqdagi summa <b>{curMoney(summary.pipelineValue)}</b></>} />
        </div>
        <div className="col-4">
          <KpiCard label="Cost per WON" value={summary.costPerWon != null ? money(summary.costPerWon) : "N/A"} tone="var(--violet)" icon={<Building2 size={15} />} sub={<>Sarf (match): <b>{money(summary.spend)}</b></>} />
        </div>
        <div className="col-4">
          <KpiCard label="ROAS" value={summary.roas != null ? `${summary.roas.toFixed(1)}×` : "N/A"} tone={(summary.roas ?? 0) >= 1 ? "var(--good)" : "var(--risk)"} icon={<TrendingUp size={15} />} sub={summary.roas != null ? (summary.roas >= 1 ? "Reklama o'zini qaytarmoqda ✓" : "Hali investitsiya qaytmagan") : "Bitim summasi/valyuta yetarli emas"} />
        </div>
        <div className="col-4">
          <KpiCard label="O'rtacha sikl" value={summary.avgCycleDays != null ? `${summary.avgCycleDays.toFixed(1)} kun` : "N/A"} tone="var(--warn)" icon={<Timer size={15} />} sub={<>Lead → Won o'rtacha davomiyligi</>} />
        </div>
      </div>

      {/* Stage funnel */}
      <Panel kicker="SKVOZNAYA VORONKA — CRM BOSQICHLARI BILAN" title="Har qadamda konversiya va tannarx" style={{ marginBottom: 14 }}>
        <div className="funnel-row crm-funnel-head" style={{ fontWeight: 600, fontSize: 11, color: "var(--text-3)", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
          <span style={{ fontFamily: "var(--mono)", letterSpacing: ".1em" }}>BOSQICH</span>
          <span style={{ fontFamily: "var(--mono)", letterSpacing: ".1em" }}>YETIB BORGAN</span>
          <span style={{ fontFamily: "var(--mono)", letterSpacing: ".1em", textAlign: "right" }}>KONV. / TANNARX</span>
        </div>
        {funnel.map((f, i) => {
          const tone = stageTone(f.stage.kind);
          return (
            <div className="funnel-row" key={f.stage.id}>
              <div className="f-label">
                {f.stage.name}
                <small style={{ color: tone }}>{f.stage.pipeline.toUpperCase()}</small>
              </div>
              <div className="funnel-track">
                <div className="funnel-fill" style={{ width: `${Math.max((f.reached / maxReached) * 100, 6)}%`, ["--tone" as string]: tone, animationDelay: `${i * 60}ms` }}>
                  <span>{whole(f.reached)}</span>
                </div>
              </div>
              <div className="f-rate">
                <b>{f.conversionFromPrev != null ? pct(f.conversionFromPrev, 1) : f.stage.kind === "won" ? `${summary.won} won` : f.stage.kind === "lost" ? `${summary.lost} lost` : "—"}</b>
                {f.costPerLead != null && f.reached > 0 ? money(f.costPerLead) : ""}
                {f.avgDaysInStage != null ? ` · ⏱ ${f.avgDaysInStage.toFixed(1)}k` : ""}
              </div>
            </div>
          );
        })}
      </Panel>

      {/* Kanban */}
      <Panel
        kicker="KANBAN DOSKA"
        title="Kim qaysi bosqichda"
        sub={`${filteredLeads.length} lead ko'rsatilmoqda — kartani bosing: to'liq jarayon (manba, tarix, summa)`}
        style={{ marginBottom: 14 }}
        action={
          <div className="toolbar">
            <label className="search-box" style={{ height: 34, minHeight: 34 }}>
              <Search size={13} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Lead, kontakt yoki kampaniya…" />
            </label>
            <button className={`tf-btn ${onlyWon ? "on" : ""}`} style={{ height: 34 }} onClick={() => setOnlyWon((v) => !v)}>
              <Filter size={13} /> Faqat yutiq
            </button>
          </div>
        }
      >
        <div className="kanban">
          {crm.stages.map((stage: CrmStage) => {
            const leads = filteredLeads.filter((l) => l.stageId === stage.id);
            const tone = stageTone(stage.kind);
            return (
              <div className="kb-col" key={stage.id} style={{ ["--tone" as string]: tone }}>
                <div className="kb-head">
                  <span className="kb-dot" />
                  <b>{stage.name}</b>
                  <span className="kb-count">{leads.length}</span>
                </div>
                <div className="kb-sum">
                  {whole(leads.reduce((s, l) => s + (l.price || 0), 0))} {cur}
                </div>
                <div className="kb-list">
                  {leads.length === 0 && <div className="kb-empty">—</div>}
                  {leads.slice(0, 30).map((lead) => {
                    const campaign = campaignOf(lead);
                    return (
                      <button className="kb-card" key={lead.id} onClick={() => openLead(lead.id)}>
                        <b>{lead.name}</b>
                        {lead.price > 0 && (
                          <span className="kb-price">
                            {whole(lead.price)} {cur}
                          </span>
                        )}
                        {campaign ? <span className="chip accent kb-chip">{campaign.originalName.slice(0, 26)}</span> : <span className="chip muted kb-chip">UTM yo'q</span>}
                        <span className="kb-meta">
                          {lead.responsible ? `${lead.responsible} · ` : ""}
                          {new Date(lead.createdAt).toLocaleDateString("uz-UZ")}
                        </span>
                      </button>
                    );
                  })}
                  {leads.length > 30 && <div className="kb-empty">+{leads.length - 30} ta yana…</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Source attribution */}
      <Panel kicker="MANBA ATRIBUTSIYASI" title="Qaysi reklama haqiqatan bitim berdi" sub="CPL emas — cost per WON va ROAS asosida qaror qiling">
        <div className="tbl-wrap">
          <table className="tbl" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>Manba (kampaniya)</th>
                <th>Leads</th>
                <th>Jarayonda</th>
                <th>Won</th>
                <th>Lost</th>
                <th>Tushum</th>
                <th>Reklama sarfi</th>
                <th>Cost/WON</th>
                <th>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((r) => (
                <tr key={r.key} style={{ cursor: "default" }}>
                  <td>
                    <b style={{ fontSize: 12 }}>{r.label}</b>
                    {r.kind === "unmatched" && (
                      <small style={{ display: "block", fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-3)", marginTop: 2 }}>
                        Utm_campaign yo'q — Meta'da UTM parametrlarini yoqing
                      </small>
                    )}
                  </td>
                  <td className="num">{whole(r.leads)}</td>
                  <td className="num">{whole(r.inProgress)}</td>
                  <td className="num tone-good" style={{ fontWeight: 600 }}>
                    {whole(r.won)}
                  </td>
                  <td className="num tone-risk">{whole(r.lost)}</td>
                  <td className="num">
                    {whole(r.revenue)} {cur}
                  </td>
                  <td className="num">{r.spend ? money(r.spend) : "—"}</td>
                  <td className="num">{r.costPerWon != null ? money(r.costPerWon) : "—"}</td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {r.roas != null ? <span className={r.roas >= 1 ? "tone-good" : "tone-risk"}>{r.roas.toFixed(1)}×</span> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="note-strip" style={{ marginTop: 12 }}>
          <Phone size={14} style={{ flex: "none", color: "var(--accent)" }} />
          <span>
            Matchlash UTM bo'yicha: AmoCRM lead'ining <b>utm_campaign</b> maydoni Meta kampaniya ID yoki nomi bilan bir xil bo'lishi kerak (Meta'da UTM shabloni: <span className="mono">utm_campaign=&#123;&#123;campaign.id&#125;&#125;</span>).
            Bog'lanmagan leadlar alohida "Manbasi aniqlanmagan" qatorida — taxminiy bog'lash qilinmadi.
          </span>
        </div>
      </Panel>
    </>
  );
}
