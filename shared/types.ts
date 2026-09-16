/**
 * Cross-platform (Meta / Google Ads / Yandex Direct ...) uchun umumiy domen model.
 * Har qanday manba (MCP connector, API snapshot) shu shaklga normalize qilinadi —
 * dashboard UI faqat shu tiplar bilan ishlaydi.
 */

export type PlatformId = "all" | "meta" | "google-ads" | "yandex-direct" | "telegram" | "offline";

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
  /** Sync dvigateli bu manbadan avtomatik (INTERVAL bilan) tortadi */
  autoSync?: boolean;
  /** Platformani ulash imkoniyati + ulangan shaxsiy hisoblar (Ulanishlar sahifasi) */
  oauth?: {
    /** App kalitlari to'liqmi — OAuth dialog shunda ishlaydi */
    ready: boolean;
    reason?: string;
    /** Nima yetishmayapti (maydon nomlari) */
    missing?: { key: string; label: string; env: string }[];
    /** Kalitlar qayerdan kelgan: env / store / mixed / none */
    source?: "env" | "store" | "mixed" | "none";
    /** Saqlangan kalitlar (niqoblangan) */
    values?: Record<string, string>;
    /** «Token bilan ulash» yo'li ochiqmi */
    manual?: boolean;
    connections: {
      id: string;
      label: string;
      status: "active" | "expired" | "error";
      error?: string;
      lastSyncAt: string | null;
      tokenExpiresAt: string | null;
      accounts: OAuthAdAccount[];
      subdomain?: string;
      method?: "oauth" | "token";
    }[];
  };
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

/** Yosh kesimi qatori (Audience sahifasi uchun) */
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

/** Bitta kun ko'rsatkichi — kunlik trend chart uchun (time_increment=1) */
export interface DailyRow {
  date: string; // YYYY-MM-DD
  spend: number;
  leads: number;
  impressions: number;
  clicks: number;
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
  /** Kunlik timeseries (Meta API real-time rejimida to'ladi) — trend chart uchun */
  daily?: DailyRow[];
  /** "all" (yagona oyna) rejimida — har bir platformaning alohida jami ko'rsatkichlari */
  platforms?: PlatformTotals[];
}

export const PLATFORM_META: Record<PlatformId, { name: string; short: string; color: string }> = {
  all: { name: "Barcha Manbalar", short: "Jami", color: "var(--text)" },
  meta: { name: "Meta Ads", short: "Meta", color: "#0866FF" },
  "google-ads": { name: "Google Ads", short: "Google", color: "#4285F4" },
  "yandex-direct": { name: "Yandex Direct", short: "Yandex", color: "#FC3F1D" },
  telegram: { name: "Telegram", short: "TG", color: "#0088cc" },
  offline: { name: "Offline", short: "Offline", color: "#10b981" },
};

/* ------------------------------------------------------------------ */
/* Yagona oyna — platformalar kesimi                                   */
/* ------------------------------------------------------------------ */

/** Bitta platformaning umumiy (jamlangan) ko'rsatkichlari — Overview'dagi kesim paneli uchun */
export interface PlatformTotals {
  platform: PlatformId;
  name: string;
  color: string;
  spend: number;
  leads: number;
  cpl: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  campaigns: number;
  /** Bu manbadan oxirgi ma'lumot olingan vaqt (ISO) */
  syncedAt: string | null;
  /** Sync dvigateli bu manbadan faol (avtomatik) tortadi */
  autoSync: boolean;
  /** Ushbu manbada qaysi ma'lumot bor / yo'q — "nima ma'lum" shaffofligi uchun */
  coverage: string[];
  limitations: string[];
}

/* ------------------------------------------------------------------ */
/* Real-time sync + jonli harakat                                       */
/* ------------------------------------------------------------------ */

export type ActivityKind =
  | "sync"
  | "lead"
  | "stage"
  | "channel"
  | "webhook"
  | "snapshot"
  | "manual"
  | "error";

/** Bitta jonli hodisa — serverda ro'y bergan vaqtda SSE orqali clientlarga yetib boradi */
export interface ActivityEvent {
  id: string;
  at: string;
  kind: ActivityKind;
  title: string;
  body?: string;
  source?: string;
  tone?: "good" | "info" | "warn" | "risk";
}

/** Bitta manba (platforma) bo'yicha sync natijasi */
export interface SyncResultItem {
  id: string;
  label: string;
  ok: boolean;
  message: string;
  durationMs: number;
  at: string;
}

/** Sync dvigatelining hozirgi holati — /api/sync va SSE sync_state orqali */
export interface SyncState {
  running: boolean;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  intervalSec: number;
  trigger: "auto" | "manual" | "startup" | null;
  results: SyncResultItem[];
  /** Qaysi manbalar avtomatik tortilishi uchun sozlangan (env to'ldirilgan) */
  configured: { meta: boolean; google: boolean; telegram: boolean };
}

/* ------------------------------------------------------------------ */
/* OAuth orqali ulangan hisoblar (foydalanuvchining o'z akkauntlari)     */
/* ------------------------------------------------------------------ */

/** Bitta ulanish ostidagi reklama kabineti (Meta act_ / Google cid) */
export interface OAuthAdAccount {
  id: string;
  name: string;
  currency: string;
  enabled: boolean;
  lastSyncAt: string | null;
}

/** Client'ga ko'rinadigan ulanish (tokensiz — maxfiy ma'lumot yuborilmaydi) */
export interface OAuthConnectionPublic {
  id: string;
  platform: "meta" | "google-ads" | "amocrm";
  label: string;
  status: "active" | "expired" | "error";
  error?: string;
  createdAt: string;
  lastSyncAt: string | null;
  tokenExpiresAt: string | null;
  /** Meta/Google: ulanish ostidagi kabinetlar */
  accounts: OAuthAdAccount[];
  /** AmoCRM: subdomain */
  subdomain?: string;
  /** Qanday ulangan: "oauth" — dialog orqali, "token" — qo'lda kiritilgan kalit */
  method?: "oauth" | "token";
}

/** Server tomonda saqlanadigan to'liq ulanish (tokenlar bilan) — client'ga YUBORILMAYDI */
export interface OAuthConnection extends OAuthConnectionPublic {
  accessToken?: string;
  refreshToken?: string;
}

/** Bitta platformaning app kalitlari holati (/api/oauth/status, /api/oauth/apps) */
export interface OAuthAppStatus {
  /** Kerakli barcha app kalitlari bormi (OAuth dialog ishlaydi) */
  ready: boolean;
  /** Yetishmayotgan maydonlar — aniq nom bilan */
  missing: { key: string; label: string; env: string }[];
  reason?: string;
  /** Kalitlar qayerdan: .env, UI'dan kiritilgan (store), aralash yoki yo'q */
  source: "env" | "store" | "mixed" | "none";
  /** Saqlangan qiymatlar (maxfiylari niqoblangan) */
  values: Record<string, string>;
  /** OAuth dialogni boshlash mumkinmi */
  oauth: boolean;
  /** «Token bilan ulash» yo'li ochiqmi (app kalitlarisiz ham ishlaydi) */
  manual: boolean;
}

/** /api/oauth/status javobi — qaysi platformalar ulashga tayyor */
export type OAuthConfigStatus = Record<"meta" | "google-ads" | "amocrm", OAuthAppStatus>;

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
