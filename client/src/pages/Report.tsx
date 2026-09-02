import { useMemo } from "react";
import { Printer } from "lucide-react";
import { buildAlerts, buildPacing, SEVERITY_META } from "@/lib/alerts";
import { buildInsights } from "@/lib/insights";
import { money, pct, ratio, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { Funnel, Panel } from "@/components/widgets";

export default function Report() {
  const { snapshot } = useDashboardContext();
  const alerts = useMemo(() => (snapshot ? buildAlerts(snapshot) : []), [snapshot]);
  const insights = useMemo(() => (snapshot ? buildInsights(snapshot) : []), [snapshot]);
  const pacing = useMemo(() => (snapshot ? buildPacing(snapshot) : null), [snapshot]);

  if (!snapshot || !pacing) return null;
  const { totals, campaigns, meta } = snapshot;
  const avgCpl = totals.cpl ?? 0;
  const topSpend = [...campaigns].sort((a, b) => b.metrics.spend - a.metrics.spend).slice(0, 6);
  const bestCpl = campaigns.filter((c) => c.metrics.leads >= 3 && c.metrics.cpl != null).sort((a, b) => (a.metrics.cpl ?? 0) - (b.metrics.cpl ?? 0)).slice(0, 4);
  const counts = {
    risk: alerts.filter((a) => a.severity === "risk").length,
    warn: alerts.filter((a) => a.severity === "warn").length,
    good: alerts.filter((a) => a.severity === "good").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };

  const kpis: { label: string; value: string; sub: string }[] = [
    { label: "Spend", value: money(totals.spend), sub: `${campaigns.length} kampaniya · ${pacing.dailySpend.toFixed(1)}/kun` },
    { label: "Leads", value: whole(totals.leads), sub: `${pacing.dailyLeads.toFixed(1)} lead/kun` },
    { label: "Cost per lead", value: money(totals.cpl), sub: `eng arzon ${money(bestCpl[0]?.metrics.cpl ?? null)}` },
    { label: "CTR (all)", value: pct(totals.ctr), sub: `link CTR ${pct(totals.linkCtr)}` },
    { label: "CPM", value: money(totals.cpm), sub: `CPC ${money(totals.cpc)}` },
    { label: "Reach", value: whole(totals.reach), sub: `frequency ${ratio(totals.frequency)}` },
  ];

  return (
    <>
      <div className="page-head no-print">
        <div>
          <span className="kicker" style={{ color: "var(--accent)" }}>
            EXECUTIVE BRIEF
          </span>
          <h1>Rahbariyat hisoboti</h1>
          <p>Bitta sahifalik xulosa: KPI, voronka, eng muhim harakatlar. «Chop etish» orqali PDF qilib saqlash mumkin (Chop etish → Save as PDF).</p>
        </div>
        <div className="right">
          <button className="primary-btn" onClick={() => window.print()}>
            <Printer size={14} /> Chop etish / PDF
          </button>
        </div>
      </div>

      {/* Report sheet */}
      <div className="report-sheet">
        <div className="rs-head">
          <div>
            <div className="rs-brand">SOF·EXPO — ADS COMMAND CENTER</div>
            <h2 style={{ margin: "6px 0 4px", fontSize: 22, fontWeight: 750 }}>
              Reklama samaradorligi hisoboti
            </h2>
            <div className="rs-meta">
              {meta.account.name} · {meta.account.externalId} · {meta.period.label} · {meta.account.currency}
            </div>
          </div>
          <div className="rs-meta" style={{ textAlign: "right" }}>
            Generatsiya: {new Date().toLocaleDateString("uz-UZ")}
            <br />
            Manba: {meta.sourceLabel}
            <br />
            Signal: {counts.risk} kritik · {counts.warn} diqqat · {counts.good} imkoniyat
          </div>
        </div>

        <div className="rs-kpis">
          {kpis.map((k) => (
            <div className="rs-kpi" key={k.label}>
              <small>{k.label}</small>
              <b>{k.value}</b>
              <span>{k.sub}</span>
            </div>
          ))}
        </div>

        <div className="rs-cols">
          <div>
            <div className="rs-sec">SKVOZNAYA VORONKA</div>
            <Funnel
              stages={[
                { key: "i", label: "Impressions", note: "KO'RSATUV", value: totals.impressions },
                { key: "c", label: "Clicks (all)", note: "BOSILISH", value: totals.clicks, tone: "var(--cyan)" },
                { key: "l", label: "Link clicks", note: "HAVOLA", value: totals.linkClicks, tone: "var(--cyan)" },
                { key: "v", label: "Landing views", note: "SAHIFA", value: totals.landingPageViews ?? 0, tone: "var(--violet)" },
                { key: "d", label: "Leads", note: "NATIJA", value: totals.leads, tone: "var(--good)" },
              ]}
            />
          </div>
          <div>
            <div className="rs-sec">ASOSIY XULOSALAR</div>
            {insights.slice(0, 4).map((i) => (
              <div className="rs-insight" key={i.id}>
                <b>• {i.title}.</b> {i.body}
              </div>
            ))}
          </div>
        </div>

        <div className="rs-sec">ENG KATTA BYUDJETLAR</div>
        <table className="tbl rs-table">
          <thead>
            <tr>
              <th>Kampaniya</th>
              <th>Spend</th>
              <th>Leads</th>
              <th>CPL (vs o'rt.)</th>
              <th>CTR</th>
              <th>Freq</th>
            </tr>
          </thead>
          <tbody>
            {topSpend.map((c) => (
              <tr key={c.id} style={{ cursor: "default" }}>
                <td>
                  <b style={{ fontSize: 11.5 }}>{c.originalName}</b>
                </td>
                <td className="num">{money(c.metrics.spend)}</td>
                <td className="num">{c.metrics.leads ? whole(c.metrics.leads) : "—"}</td>
                <td className="num">
                  {c.metrics.cpl ? (
                    <span className={(c.metrics.cpl ?? 0) <= avgCpl ? "tone-good" : "tone-risk"}>
                      {money(c.metrics.cpl)} ({((c.metrics.cpl! - avgCpl) / avgCpl >= 0 ? "+" : "") + (((c.metrics.cpl! - avgCpl) / avgCpl) * 100).toFixed(0)}%)
                    </span>
                  ) : (
                    "N/A"
                  )}
                </td>
                <td className="num">{pct(c.metrics.ctr)}</td>
                <td className="num">{ratio(c.metrics.frequency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="rs-cols" style={{ marginTop: 14 }}>
          <div>
            <div className="rs-sec">ENG ARZON LEAD MANBALARI</div>
            {bestCpl.map((c) => (
              <div className="rs-insight" key={c.id}>
                <b>• {c.originalName}</b> — {money(c.metrics.cpl)} CPL, {whole(c.metrics.leads)} lead.
              </div>
            ))}
            <div className="rs-insight">
              <b>• Prognoz:</b> joriy surat ({pacing.dailySpend.toFixed(0)}/kun) 30 kunda ≈ {money(pacing.projected30Spend)} sarf va ≈ {whole(pacing.projected30Leads)} lead.
              {pacing.scale && (
                <>
                  {" "}«{pacing.scale.name}» ga +$100 ≈ +{pacing.scale.extraLeadsPer100} lead.
                </>
              )}
            </div>
          </div>
          <div>
            <div className="rs-sec">HARAKAT SIGNALI</div>
            {alerts.slice(0, 4).map((a) => (
              <div className="rs-insight" key={a.id}>
                <b>
                  [{SEVERITY_META[a.severity].label}] {a.title}.
                </b>{" "}
                {a.body}
              </div>
            ))}
          </div>
        </div>

        <div className="rs-foot">
          Metodika: CPL = Spend / Leads; lead qaytmaganlar N/A. Ma'lumotlar {meta.sourceLabel} dan, {new Date(meta.syncedAt).toLocaleString("uz-UZ")} da sinxronlangan. Hisobotda faqat real eksport raqamlari ishlatilgan.
          {meta.limitations.length ? ` Cheklovlar: ${meta.limitations.join(" ")}` : ""}
        </div>
      </div>

      <Panel className="no-print" kicker="ESLATMA" title="PDF qanday olinadi" style={{ marginTop: 14 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
          «Chop etish / PDF» tugmasi brauzer chop etish oynasini ochadi → maqsad sifatida <b>«Save as PDF»</b> ni tanlang. Hisobot avtomatik yorug' rejimga o'tadi, sidebar va tugmalar chiqmaydi.
        </p>
      </Panel>
    </>
  );
}
