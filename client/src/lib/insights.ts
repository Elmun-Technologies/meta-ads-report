/**
 * Insight dvigateli — snapshot ustida real hisob-kitob qilib boshqaruv uchun
 * xulosalar (o'zbekcha) generatsiya qiladi. Hech qanday qo'lda yozilgan
 * "fact" yo'q: hammasi kelgan ma'lumotdan hisoblanadi.
 */
import type { CampaignNode, NormalizedSnapshot } from "@shared/types";
import { money, pct, whole } from "./format";

export type InsightTone = "good" | "warn" | "risk" | "info";

export interface Insight {
  id: string;
  tone: InsightTone;
  icon: "trophy" | "scale" | "waste" | "fatigue" | "focus" | "chat" | "budget";
  title: string;
  body: string;
  action?: { label: string; kind: "campaign" | "creatives"; id?: string };
}

const leadCampaigns = (campaigns: CampaignNode[]) => campaigns.filter((c) => c.metrics.leads > 0);

export function buildInsights(snapshot: NormalizedSnapshot): Insight[] {
  const { campaigns, totals, age } = snapshot;
  const insights: Insight[] = [];
  const led = leadCampaigns(campaigns);

  /* 1. Eng samarali lead manbasi */
  const qualified = led.filter((c) => c.metrics.leads >= 5);
  if (qualified.length) {
    const best = qualified.reduce((a, b) => ((a.metrics.cpl ?? Infinity) <= (b.metrics.cpl ?? Infinity) ? a : b));
    insights.push({
      id: "efficiency",
      tone: "good",
      icon: "trophy",
      title: `${best.expo} — eng arzon lead manbasi`,
      body: `«${best.name}» ${whole(best.metrics.leads)} lead ni ${money(best.metrics.cpl)} CPL bilan keltirdi — account o'rtachasi (${money(totals.cpl)}) dan ${pct((1 - (best.metrics.cpl ?? 1) / (totals.cpl ?? 1)) * 100, 0)} arzon. Scale-test uchun asosiy kandidat.`,
      action: { label: "Kampaniyani ochish", kind: "campaign", id: best.id },
    });
  }

  /* 2. Samaradorlik chempionlari vs CPL o'rtacha — scale gipotezalari */
  const avgCpl = totals.cpl ?? 0;
  const belowAvg = qualified.filter((c) => (c.metrics.cpl ?? Infinity) < avgCpl);
  if (belowAvg.length >= 2) {
    const totalLeads = belowAvg.reduce((s, c) => s + c.metrics.leads, 0);
    const totalSpend = belowAvg.reduce((s, c) => s + c.metrics.spend, 0);
    insights.push({
      id: "scale",
      tone: "info",
      icon: "scale",
      title: `${belowAvg.length} kampaniya o'rtacha CPL dan yaxshi ishlayapti`,
      body: `Bu guruh ${whole(totalLeads)} lead berdi (${whole(totals.leads)} tadan) va ${money(totalSpend)} sarfladi — guruh CPL ${money(totalLeads ? totalSpend / totalLeads : null)}. Byudjetni shu kampaniyalarga ko'chirish eng tez samara beradi.`,
    });
  }

  /* 3. Lead kelmagan sarflar */
  const noLead = campaigns.filter((c) => c.metrics.leads === 0 && c.metrics.spend > 0);
  const noLeadSpend = noLead.reduce((s, c) => s + c.metrics.spend, 0);
  if (noLead.length) {
    insights.push({
      id: "waste",
      tone: noLeadSpend > (totals.spend ?? 0) * 0.1 ? "risk" : "warn",
      icon: "waste",
      title: `${noLead.length} kampaniyada lead qaytmadi — ${money(noLeadSpend)}`,
      body: `Jami sarfning ${pct((noLeadSpend / (totals.spend || 1)) * 100, 1)} shu kampaniyalarga tegishli: ${noLead
        .slice(0, 3)
        .map((c) => `«${c.originalName}» (${money(c.metrics.spend)})`)
        .join(", ")}${noLead.length > 3 ? " va boshqalar" : ""}. Maqsad (objective) va event setupini tekshirib, yo'qotishni to'xtatish kerak.`,
    });
  }

  /* 4. Auditoriya charchoq (frequency) */
  const freqCampaign = campaigns.filter((c) => (c.metrics.frequency ?? 0) >= 3).sort((a, b) => (b.metrics.frequency ?? 0) - (a.metrics.frequency ?? 0));
  const freqAge = age.filter((a) => (a.frequency ?? 0) >= 3);
  if (freqCampaign.length || freqAge.length) {
    const parts: string[] = [];
    if (freqCampaign.length) parts.push(`«${freqCampaign[0].originalName}» — ${freqCampaign[0].metrics.frequency?.toFixed(2)}×`);
    if (freqAge.length) parts.push(`${freqAge.map((a) => a.age).join(", ")} yosh segmentlarida 3× dan yuqori`);
    insights.push({
      id: "fatigue",
      tone: "warn",
      icon: "fatigue",
      title: "Auditoriya charchash belgilari (frequency ≥ 3×)",
      body: `${parts.join("; ")}. Bunday kampaniyalarda CPM o'sadi va CTR tushadi — kreativni yangilash yoki auditoriyani kengaytirish kerak.`,
    });
  }

  /* 5. CTR lideri */
  const ctrRanked = [...campaigns].filter((c) => c.metrics.ctr != null && c.metrics.impressions > 5000).sort((a, b) => (b.metrics.ctr ?? 0) - (a.metrics.ctr ?? 0));
  if (ctrRanked.length >= 2) {
    const top = ctrRanked[0];
    insights.push({
      id: "ctr",
      tone: "info",
      icon: "focus",
      title: `Eng kuchli CTR: ${pct(top.metrics.ctr)}`,
      body: `«${top.originalName}» ${whole(top.metrics.impressions)} ko'rsatuvda ${pct(top.metrics.ctr)} CTR oldi (account: ${pct(totals.ctr)}). Shu kampaniyaning creative g'oyasini boshqa guruhlarga ko'chirish mumkin.`,
      action: { label: "Kampaniyani ochish", kind: "campaign", id: top.id },
    });
  }

  /* 6. Messaging conversatsiyalar */
  if ((totals.messagingConversations ?? 0) > 0) {
    insights.push({
      id: "messaging",
      tone: "info",
      icon: "chat",
      title: `${whole(totals.messagingConversations)} messaging suhbat boshlandi`,
      body: `Lead'ga qo'shimcha kanal: Direct/WhatsApp suhbatlari. CRM da lead sifati shu kanaldan ham o'lchanishi kerak — aks holda CPL haqiqiy natijani bo'rttirib ko'rsatadi.`,
    });
  }

  /* 7. Byudjet konsentratsiyasi */
  const sorted = [...campaigns].sort((a, b) => b.metrics.spend - a.metrics.spend);
  if (sorted.length >= 3) {
    const top = sorted[0];
    const share = (top.metrics.spend / (totals.spend || 1)) * 100;
    insights.push({
      id: "concentration",
      tone: share > 35 ? "warn" : "info",
      icon: "budget",
      title: `Byudjet ${pct(share, 0)} bitta kampaniyada to'plangan`,
      body: `«${top.originalName}» — ${money(top.metrics.spend)} sarflandi va ${whole(top.metrics.leads)} lead berdi. Konsentratsiya ${share > 35 ? "yuqori" : "o'rtacha"}: bitta kampaniya buzilsa, umumiy natija sezilarli tushadi.`,
    });
  }

  return insights;
}

export const TONE_STYLE: Record<InsightTone, { color: string; bg: string; label: string }> = {
  good: { color: "var(--good)", bg: "var(--good-soft)", label: "Signal" },
  warn: { color: "var(--warn)", bg: "var(--warn-soft)", label: "Diqqat" },
  risk: { color: "var(--risk)", bg: "var(--risk-soft)", label: "Xavf" },
  info: { color: "var(--accent)", bg: "var(--accent-soft)", label: "Kuzatuv" },
};
