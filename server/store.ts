/**
 * Yengil JSON store — Prisma/SQLite o'rnini bosadi.
 *
 * Nega: (1) SQLite serverless (Vercel) rejimida yozib bo'lmaydigan fayl tizimida
 * ishlaydi; (2) prisma engine binari har doim ham yuklanmaydi (cheklangan tarmoq);
 * (3) ma'lumot hajmi kichik (kanallar, postlar, offline kampaniyalar, leadlar) —
 * to'liq DB ortiqcha. Fayl = server/data/store.json, atomic yoziladi.
 *
 * Kontraktlar eski prisma modellarini takrorlaydi (camelCase) — marshrut kodi
 * deyarli o'zgarmasdan ishlashda davom etadi.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { ActivityEvent, ActivityKind, SyncState, SyncResultItem } from "@shared/types";
import type { OAuthConnection } from "@shared/types";
import type { StoredApps } from "@shared/oauthSetup";
import { DATA_DIR } from "./paths";

/** Store fayli — snapshotlar papkasi yonida (server/data/store.json).
 *  DATA_DIR barcha muhitlarda (dev / dist / serverless) to'g'ri aniqlanadi. */
const STORE_FILE = path.join(path.dirname(DATA_DIR), "store.json");

/* ------------------------------------------------------------------ */
/* Modellar (prisma sxemasini aks ettiradi)                            */
/* ------------------------------------------------------------------ */

export interface TelegramPost {
  id: string;
  tgstatPostId: string | null;
  channelId: string;
  text: string;
  date: string; // ISO
  views: number;
  shares: number;
  forwards: number;
  reactions: number;
  commentsCount: number;
  link: string;
  /** Qo'lda kiritilgan reklama narxi */
  cost: number;
  syncedAt: string;
}

export interface TelegramChannel {
  id: string;
  username: string;
  name: string;
  subscribers: number;
  avgPostReach: number;
  advReach12h: number;
  advReach24h: number;
  advReach48h: number;
  errPercent: number;
  dailyReach: number;
  forwardsCount: number;
  mentionsCount: number;
  postsCount: number;
  tgstatId: number | null;
  syncedAt: string;
  createdAt: string;
  posts: TelegramPost[];
}

export interface OfflineCampaign {
  id: string;
  name: string;
  originalName: string;
  objective: string | null;
  expo: string;
  platform: "offline";
  goal: "leads" | "calls" | "engagement" | "other";
  createdAt: string;
  metrics: {
    spend: number;
    impressions: number;
    clicks: number;
    linkClicks: number;
    leadsCount: number;
  };
}

export interface StoreLead {
  id: string;
  name: string;
  source: "offline" | "amocrm";
  createdAt: string;
  updatedAt: string;
  stageId: string;
  stageName: string;
  pipeline: string;
  price: number;
  responsible?: string | null;
  contactName?: string | null;
  phone?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmSource?: string | null;
  campaignId?: string | null;
  lossReason?: string | null;
  history: { stage: string; at: string }[];
}

export interface StoreData {
  channels: TelegramChannel[];
  offlineCampaigns: OfflineCampaign[];
  leads: StoreLead[];
  activity: ActivityEvent[];
  sync: SyncState;
  /** OAuth orqali ulangan hisoblar (tokenlar bilan — client'ga yuborilmaydi) */
  oauth?: OAuthConnection[];
  /** UI'dan kiritilgan OAuth APP kalitlari (.env bilan birlashtirilib o'qiladi) */
  oauthApps?: StoredApps;
}

export const DEFAULT_SYNC_INTERVAL_SEC = 300;

function emptyStore(): StoreData {
  return {
    channels: [],
    offlineCampaigns: [],
    leads: [],
    activity: [],
    oauth: [],
    oauthApps: {},
    sync: {
      running: false,
      lastSyncAt: null,
      nextSyncAt: null,
      intervalSec: DEFAULT_SYNC_INTERVAL_SEC,
      trigger: null,
      results: [],
      configured: { meta: false, google: false, telegram: false },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Yuklash / saqlash                                                   */
/* ------------------------------------------------------------------ */

let data: StoreData | null = null;
let saveTimer: NodeJS.Timeout | null = null;

export function getStore(): StoreData {
  if (data) return data;
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8")) as Partial<StoreData>;
      data = { ...emptyStore(), ...raw };
      // sync har doiz yangi interval bilan tirik bo'lishi kerak
      data.sync = { ...emptyStore().sync, ...raw.sync, running: false };
      return data;
    }
  } catch (err) {
    console.error("[store] o'qishda xato, bo'sh store ishlatiladi:", err);
  }
  data = emptyStore();
  return data;
}

/** Atomic yozish — yarim yozilgan fayl qolmasligi uchun (tmp → rename) */
function persistNow() {
  if (!data) return;
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    const tmp = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, STORE_FILE);
  } catch (err) {
    console.error("[store] saqlashda xato:", err);
  }
}

/** O'zgarishni qo'llash va diskka yozish (debounce) */
export function mutate<T>(fn: (s: StoreData) => T): T {
  const s = getStore();
  const out = fn(s);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 250);
  return out;
}

/** Serverless (faqat o'qish) rejimida diskka yozish mumkin emas — baribir urinamiz, xato bo'lsa jim o'tamiz */
export function persist() {
  persistNow();
}

export const STORE_PATH = STORE_FILE;

/* ------------------------------------------------------------------ */
/* Jonli harakat (activity) logi                                       */
/* ------------------------------------------------------------------ */

/** Store o'zgarishini SSE orqali tarqatadigan funksiya — app.ts da ro'yxatdan o'tkaziladi */
type Broadcaster = (event: string, payload?: unknown) => void;
let broadcaster: Broadcaster | null = null;

export function setBroadcaster(fn: Broadcaster) {
  broadcaster = fn;
}

export function logActivity(ev: {
  kind: ActivityKind;
  title: string;
  body?: string;
  source?: string;
  tone?: ActivityEvent["tone"];
}): ActivityEvent {
  const event: ActivityEvent = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind: ev.kind,
    title: ev.title,
    body: ev.body,
    source: ev.source,
    tone: ev.tone ?? "info",
  };
  mutate(s => {
    s.activity.unshift(event);
    if (s.activity.length > 120) s.activity.length = 120;
  });
  broadcaster?.("activity", event);
  return event;
}

export function recentActivity(limit = 50): ActivityEvent[] {
  return getStore().activity.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Sync holati                                                         */
/* ------------------------------------------------------------------ */

export function updateSyncState(patch: Partial<SyncState>) {
  const s = getStore();
  const prev = s.sync;
  s.sync = { ...prev, ...patch };
  broadcaster?.("sync_state", s.sync);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 250);
  return s.sync;
}

export function recordSyncResults(results: SyncResultItem[], trigger: SyncState["trigger"]) {
  const interval = syncIntervalSec();
  const now = new Date();
  return updateSyncState({
    running: false,
    lastSyncAt: now.toISOString(),
    nextSyncAt: new Date(now.getTime() + interval * 1000).toISOString(),
    intervalSec: interval,
    trigger,
    results,
  });
}

export function syncIntervalSec(): number {
  const raw = Number(process.env.SYNC_INTERVAL_SEC || 0);
  if (Number.isFinite(raw) && raw >= 30) return Math.floor(raw);
  return DEFAULT_SYNC_INTERVAL_SEC;
}

/**
 * "configured" ni kim hisoblaydi — sync.ts ro'yxatdan o'tkazadi.
 * Sabab: store.ts oauthApps/connections modullarini import qilmasligi kerak
 * (aks holda aylanma import), lekin holat faqat .env ga emas — UI'dan kiritilgan
 * kalitlar va ulangan hisoblarga ham qarashi kerak.
 */
type ConfiguredResolver = () => SyncState["configured"];
let configuredResolver: ConfiguredResolver | null = null;

export function setConfiguredResolver(fn: ConfiguredResolver) {
  configuredResolver = fn;
}

function envConfigured(): SyncState["configured"] {
  return {
    meta: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID),
    google: Boolean(
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
        process.env.GOOGLE_ADS_CLIENT_ID &&
        process.env.GOOGLE_ADS_CLIENT_SECRET &&
        process.env.GOOGLE_ADS_REFRESH_TOKEN
    ),
    telegram: Boolean(process.env.TGSTAT_TOKEN),
  };
}

export function currentSyncState(): SyncState {
  const s = getStore();
  return {
    ...s.sync,
    intervalSec: syncIntervalSec(),
    configured: configuredResolver ? configuredResolver() : envConfigured(),
  };
}
