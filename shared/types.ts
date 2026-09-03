/**
 * Cross-platform (Meta / Google Ads / Yandex Direct ...) uchun umumiy domen model.
 * Har qanday manba (MCP connector, API snapshot) shu shaklga normalize qilinadi —
 * dashboard UI faqat shu tiplar bilan ishlaydi.
 */

export type PlatformId = "meta" | "google-ads" | "yandex-direct";

export type ConnectionStatus = "connected" | "ready" | "planned";

export interface AccountRef {
  id: string;
  name: string;
  currency: string;
  /** Platform account/kabinet identifikatori (masalan act_... yoki 123-456-7890) */
  externalId?: string;
}

export interface ConnectionInfo {
  id: string;
  name: string;
  vendor: string;
  /** ads — reklama platformasi, crm — lead lifecycle manbasi */
  kind?: "ads" | "crm";
  status: ConnectionStatus;
  accounts: AccountRef[];
  syncedAt: string | null;
  note?: string;
}

export interface Metrics {
  spend: number;
  impressions: number;
  reach: number | null;
  frequency: number | null;
  clicks: number;
  linkClicks: number;
  ctr: number | null; // % (all clicks)
  linkCtr: number | null; // % (link clicks)
  cpc: number | null;
  cpm: number | null;
  leads: number;
  cpl: number | null;
  landingPageViews: number | null;
  messagingConversations: number | null;
  videoViews: number | null;
  /** Ijtimoiy interaksiya (actions kesimidan) */
  reactions?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  postEngagement?: number;
  /** Messaging chuqurligi: birinchi javob */
  messagingFirstReply?: number;
  /** "Qo'ng'iroq qilish" tugmasi bosilgan soni (click-to-call) */
  calls?: number;
}

/** Kampaniya/kreativ qaysi natija uchun optimallashtirilgani (leads > calls > engagement ustuvorligida aniqlanadi) */
export type CampaignGoal = "leads" | "calls" | "engagement" | "other";

export interface AdSetRef {
  id: string;
  name: string; // canonical
  originalName: string;
}

export interface CreativeNode {
  id: string;
  name: string; // canonical
  originalName: string;
  campaignId: string;
  adset: AdSetRef | null;
  status: string | null;
  effectiveStatus: string | null;
  createdTime: string | null;
  metrics: Metrics;
  /** Ad darajasida lead qaytmagan bo'lsa false — UI buni "N/A" deb ko'rsatadi */
  hasLeads: boolean;
  goal: CampaignGoal;
}

export interface CampaignNode {
  id: string;
  name: string; // canonical
  originalName: string;
  objective: string | null;
  expo: string;
  platform: PlatformId;
  metrics: Metrics;
  creatives: CreativeNode[];
  goal: CampaignGoal;
}

/** Metrics'dan maqsad turini aniqlaydi: leads > calls > engagement > other ustuvorligida */
export function inferGoal(m: Metrics): CampaignGoal {
  if (m.leads > 0) return "leads";
  if ((m.calls ?? 0) > 0) return "calls";
  if ((m.postEngagement ?? 0) > 0 || (m.messagingConversations ?? 0) > 0) return "engagement";
  return "other";
}

export const GOAL_META: Record<CampaignGoal, { label: string; short: string }> = {
  leads: { label: "Murojaat (Lead)", short: "Lead" },
  calls: { label: "Qo'ng'iroq (Call)", short: "Call" },
  engagement: { label: "Faollik (Engagement)", short: "Engagement" },
  other: { label: "Aniqlanmagan", short: "—" },
};

export interface AgeRow {
  age: string;
  spend: number;
  leads: number;
  impressions: number;
  reach: number | null;
  frequency: number | null;
  clicks: number;
  ctr: number | null;
  cpm: number | null;
}

export interface SnapshotMeta {
  platform: PlatformId;
  account: AccountRef;
  period: { start: string; end: string; label: string };
  syncedAt: string; // ISO — snapshot fayli yozilgan/yangilangan vaqt
  sourceLabel: string;
  limitations: string[];
  /** Qaysi fayldan o'qilgan (davrlararo taqqoslash uchun) */
  file?: string;
}

/** /api/snapshots ro'yxati elementi — mavjud davrlar/eksportlar */
export interface SnapshotInfo {
  file: string;
  platform: PlatformId;
  accountName: string;
  periodLabel: string;
  syncedAt: string;
}

export interface NormalizedSnapshot {
  meta: SnapshotMeta;
  totals: Metrics;
  campaigns: CampaignNode[];
  creatives: CreativeNode[];
  age: AgeRow[];
}

export const PLATFORM_META: Record<PlatformId, { name: string; short: string; color: string }> = {
  meta: { name: "Meta Ads", short: "Meta", color: "#0866FF" },
  "google-ads": { name: "Google Ads", short: "Google", color: "#4285F4" },
  "yandex-direct": { name: "Yandex Direct", short: "Yandex", color: "#FC3F1D" },
};

/* ------------------------------------------------------------------ */
/* CRM (AmoCRM) — lead lifecycle                                       */
/* ------------------------------------------------------------------ */

export type CrmStageKind = "new" | "in_progress" | "won" | "lost";

export interface CrmStage {
  id: string;
  name: string;
  pipeline: string;
  sort: number;
  kind: CrmStageKind;
}

export interface CrmHistoryEntry {
  at: string;
  stage: string;
}

export interface CrmLead {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stageId: string;
  stageName: string;
  pipeline: string;
  price: number;
  responsible: string | null;
  contactName: string | null;
  phone: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmSource: string | null;
  /** Meta kampaniyasiga match (utm_campaign bo'yicha) */
  campaignId: string | null;
  creativeId: string | null;
  history: CrmHistoryEntry[];
  lossReason: string | null;
}

export interface CrmData {
  account: string;
  currency: string;
  syncedAt: string;
  sourceLabel: string;
  stages: CrmStage[];
  leads: CrmLead[];
  matchedLeads: number;
  unmatchedLeads: number;
}

/** Bir leadsiz stage funnel qatori */
export interface CrmStageStat {
  stage: CrmStage;
  /** Bu bosqichga yetib borgan leadlar (history + hozirgi holat) */
  reached: number;
  conversionFromPrev: number | null;
  /** Bosqichga yetib borgan har bir leadning reklama tannarxi (pro-rata) */
  costPerLead: number | null;
  avgDaysInStage: number | null;
  totalPrice: number;
}

export interface CrmSourceRow {
  key: string;
  label: string;
  kind: "campaign" | "unmatched";
  leads: number;
  inProgress: number;
  won: number;
  lost: number;
  revenue: number;
  spend: number;
  costPerWon: number | null;
  roas: number | null;
}
