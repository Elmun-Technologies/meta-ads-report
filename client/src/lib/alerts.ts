/**
 * Signal dvigateli — dashboard foydalanuvchini o'zi izlamasdan ogohlantiradi.
 * Uch qatlam:
 *   1) buildAlerts    — biznes qoidalari (CPL regressiya, lead'siz sarf, charchash, disapproved...)
 *   2) buildAnomalies — statistik outayer'lar (robust MAD z-score)
 *   3) buildPacing    — byudjet sur'ati va prognoz
 * Hammasi faqat snapshotdagi real raqamlardan hisoblanadi.
 */
import type { NormalizedSnapshot } from "@shared/types";
import { money, pct, ratio, whole } from "./format";

export type Severity = "risk" | "warn" | "info" | "good";

export interface Alert {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  target?: { kind: "campaign" | "creative"; id: string };
}

export const SEVERITY_META: Record<Severity, { label: string; chip: string }> = {
  risk: { label: "Kritik", chip: "risk" },
  warn: { label: "Diqqat", chip: "warn" },
  info: { label: "Ma'lumot", chip: "accent" },
  good: { label: "Imkoniyat", chip: "good" },
};

/* ------------------------------------------------------------------ */
/* 1. Biznes qoidalari                                                 */
/* ------------------------------------------------------------------ */

export function buildAlerts(s: NormalizedSnapshot): Alert[] {
  const alerts: Alert[] = [];
  const { campaigns, creatives, totals } = s;
  const avgCpl = totals.cpl ?? 0;

  /* Kritik: lead kelmagan, lekin pul ketgan */
  const noLead = campaigns.filter((c) => c.metrics.leads === 0 && c.metrics.spend > 0).sort((a, b) => b.metrics.spend - a.metrics.spend);
  if (noLead.length) {
    const spend = noLead.reduce((acc, c) => acc + c.metrics.spend, 0);
    alerts.push({
      id: "no-lead-spend",
      severity: spend > (totals.spend ?? 0) * 0.1 ? "risk" : "warn",
      title: `${noLead.length} kampaniyada lead qaytmadi — ${money(spend)}`,
      body: `Jami sarfning ${pct((spend / (totals.spend || 1)) * 100, 1)}: ${noLead
        .slice(0, 3)
        .map((c) => `«${c.originalName}»`)
        .join(", ")}${noLead.length > 3 ? "…" : ""}. Objective/event setup tekshirilsa yo'qotish to'xtaydi.`,
      target: noLead[0] ? { kind: "campaign", id: noLead[0].id } : undefined,
    });
  }

  /* Kritik: disapproved kreativlar */
  const disapproved = creatives.filter((c) => c.effectiveStatus === "DISAPPROVED");
  if (disapproved.length) {
    alerts.push({
      id: "disapproved",
      severity: "risk",
      title: `${disapproved.length} kreativ Meta tomonidan rad etilgan (DISAPPROVED)`,
      body: `Rad etilgan: ${disapproved.map((c) => `«${c.originalName}»`).join(", ")}. Ads Manager'da sababini ko'rib, tuzatib qayta yuborish kerak — aks holda shu slotlarda trafik yo'q.`,
      target: { kind: "creative", id: disapproved[0].id },
    });
  }

  /* CPL regressiya — o'rtachadan 1.5x qimmat */
  const expensive = campaigns.filter((c) => c.metrics.leads >= 3 && c.metrics.cpl != null && avgCpl > 0 && (c.metrics.cpl ?? 0) > avgCpl * 1.5).sort((a, b) => (b.metrics.cpl ?? 0) - (a.metrics.cpl ?? 0));
  if (expensive.length) {
    alerts.push({
      id: "cpl-regression",
      severity: "warn",
      title: `${expensive.length} kampaniyada CPL o'rtachadan ${pct(((expensive[0].metrics.cpl ?? 0) / avgCpl - 1) * 100, 0)} qimmatgacha`,
      body: `Eng qimmati: «${expensive[0].originalName}» — ${money(expensive[0].metrics.cpl)} (o'rtacha ${money(avgCpl)}). Byudjetni arzon manbalarga ko'chirish kerak.`,
      target: { kind: "campaign", id: expensive[0].id },
    });
  }

  /* Auditoriya charchashi */
  const fatigued = campaigns.filter((c) => (c.metrics.frequency ?? 0) >= 3);
  if (fatigued.length) {
    const worst = fatigued.sort((a, b) => (b.metrics.frequency ?? 0) - (a.metrics.frequency ?? 0))[0];
    alerts.push({
      id: "fatigue",
      severity: "warn",
      title: `Auditoriya charchashi: ${fatigued.length} kampaniyada frequency ≥ 3×`,
      body: `Eng yuqorisi «${worst.originalName}» — ${ratio(worst.metrics.frequency)}. CPM o'sishi va CTR tushishi kutiladi: kreativ yangilash yoki auditoriyani kengaytirish kerak.`,
      target: { kind: "campaign", id: worst.id },
    });
  }

  /* Pauzada, lekin sarf bilan — qaror talab */
  const pausedWithSpend = creatives.filter((c) => (c.effectiveStatus === "PAUSED" || c.effectiveStatus === "CAMPAIGN_PAUSED" || c.effectiveStatus === "ADSET_PAUSED") && c.metrics.spend > 0);
  if (pausedWithSpend.length) {
    alerts.push({
      id: "paused-spend",
      severity: "info",
      title: `${pausedWithSpend.length} kreativ pauzada (davrda sarf bor edi)`,
      body: `Ular davr ichida ${money(pausedWithSpend.reduce((acc, c) => acc + c.metrics.spend, 0))} sarflagan. CPL hisobiga kiradi — qayta yoqish yoki arxiv qarori kerak.`,
    });
  }

  /* CTR zaif */
  const weakCtr = campaigns.filter((c) => c.metrics.spend > 20 && c.metrics.ctr != null && (totals.ctr ?? 0) > 0 && (c.metrics.ctr ?? 0) < (totals.ctr ?? 0) * 0.6);
  if (weakCtr.length) {
    alerts.push({
      id: "weak-ctr",
      severity: "info",
      title: `${weakCtr.length} kampaniyada CTR o'rtachadan 40%+ past`,
      body: `Masalan «${weakCtr[0].originalName}» — ${pct(weakCtr[0].metrics.ctr)} (o'rtacha ${pct(totals.ctr)}). Creative angle yoki audience signalini almashtirish kerak.`,
      target: { kind: "campaign", id: weakCtr[0].id },
    });
  }

  /* Imkoniyat: scale kandidati */
  const qualified = campaigns.filter((c) => c.metrics.leads >= 10 && c.metrics.cpl != null);
  if (qualified.length) {
    const best = qualified.reduce((a, b) => ((a.metrics.cpl ?? Infinity) <= (b.metrics.cpl ?? Infinity) ? a : b));
    if ((best.metrics.cpl ?? Infinity) < avgCpl) {
      alerts.push({
        id: "scale-candidate",
        severity: "good",
        title: `Scale imkoniyati: «${best.originalName}»`,
        body: `${whole(best.metrics.leads)} lead · ${money(best.metrics.cpl)} CPL (o'rtacha ${money(avgCpl)}). +$100 byudjet ≈ +${Math.round(100 / (best.metrics.cpl ?? 1))} lead — CRM sifati tasdiqlasa oshirish kerak.`,
        target: { kind: "campaign", id: best.id },
      });
    }
  }

  /* Ma'lumot to'liqligi */
  const withoutLeadData = creatives.length && creatives.every((c) => !c.hasLeads);
  if (withoutLeadData) {
    alerts.push({
      id: "ad-level-leads-missing",
      severity: "info",
      title: "Kreativ darajasida lead metrikasi yo'q",
      body: "Meta bu eksportda ad-level lead action qaytarmagan — creative reytingi spend/CTR asosida. Keyingi snapshotda ad-level actions sorovi qo'shilsa CPL reytingi o'zi paydo bo'ladi.",
    });
  }

  const order: Record<Severity, number> = { risk: 0, warn: 1, good: 2, info: 3 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ------------------------------------------------------------------ */
/* 2. Statistik anomaliyalar (robust MAD z-score)                      */
/* ------------------------------------------------------------------ */

export interface Anomaly {
  campaignId: string;
  campaign: string;
  metric: "CPL" | "CPM" | "CTR" | "Frequency";
  value: string;
  z: number;
  direction: "high" | "low";
  why: string;
}

const robustZ = (values: number[]): { z: (v: number) => number; median: number } => {
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)];
  if (!mad) return { z: () => 0, median };
  return { z: (v) => (0.6745 * (v - median)) / mad, median };
};

export function buildAnomalies(s: NormalizedSnapshot, threshold = 2): Anomaly[] {
  const out: Anomaly[] = [];
  const push = (metric: Anomaly["metric"], extract: (c: NormalizedSnapshot["campaigns"][number]) => number | null, format: (v: number) => string, why: string) => {
    const rows = s.campaigns.map((c) => ({ c, v: extract(c) })).filter((r): r is { c: NormalizedSnapshot["campaigns"][number]; v: number } => r.v != null && r.v > 0);
    if (rows.length < 5) return;
    const { z } = robustZ(rows.map((r) => r.v));
    for (const { c, v } of rows) {
      const score = z(v);
      if (Math.abs(score) >= threshold) {
        out.push({ campaignId: c.id, campaign: c.originalName, metric, value: format(v), z: score, direction: score > 0 ? "high" : "low", why });
      }
    }
  };

  push("CPL", (c) => c.metrics.cpl, (v) => money(v), "Boshqa kampaniyalardan statistik jihatdan sezilarli farq qiladi — sababini tushunish kerak");
  push("CPM", (c) => c.metrics.cpm, (v) => money(v), "1000 ko'rsatuv narxi keskin farq qiladi — auditoriya torligi yoki raqobat signali");
  push("CTR", (c) => c.metrics.ctr, (v) => pct(v), "Bosilish darajasi outlier — eng kuchli yoki eng zaif creative signal");
  push("Frequency", (c) => c.metrics.frequency, (v) => ratio(v), "Ko'rsatuv takrorlanishi outlier — auditoriya tor yoki juda keng");

  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 8);
}

/* ------------------------------------------------------------------ */
/* 3. Pacing va prognoz                                                */
/* ------------------------------------------------------------------ */

export interface Pacing {
  days: number;
  dailySpend: number;
  dailyLeads: number;
  projected30Spend: number;
  projected30Leads: number;
  daysNote: string;
  scale: { name: string; cpl: number; leads: number; extraLeadsPer100: number } | null;
}

export function buildPacing(s: NormalizedSnapshot): Pacing {
  const start = new Date(s.meta.period.start);
  const end = new Date(s.meta.period.end);
  const validDays = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start;
  const days = validDays ? Math.round((end.getTime() - start.getTime()) / 86400000) + 1 : 31;
  const dailySpend = (s.totals.spend ?? 0) / days;
  const dailyLeads = (s.totals.leads ?? 0) / days;

  const qualified = s.campaigns.filter((c) => c.metrics.leads >= 10 && c.metrics.cpl != null);
  const best = qualified.length ? qualified.reduce((a, b) => ((a.metrics.cpl ?? Infinity) <= (b.metrics.cpl ?? Infinity) ? a : b)) : null;

  return {
    days,
    dailySpend,
    dailyLeads,
    projected30Spend: dailySpend * 30,
    projected30Leads: dailyLeads * 30,
    daysNote: validDays ? `${s.meta.period.label} (${days} kun)` : "davr sanalari noma'lum — 31 kun deb olingan",
    scale:
      best && best.metrics.cpl
        ? {
            name: best.originalName,
            cpl: best.metrics.cpl,
            leads: best.metrics.leads,
            extraLeadsPer100: Math.round(100 / best.metrics.cpl),
          }
        : null,
  };
}
