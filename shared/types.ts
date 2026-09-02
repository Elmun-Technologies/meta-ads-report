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
  id: PlatformId;
  name: string;
  vendor: string;
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
}

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
}

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
