/**
 * Real-time sync dvigateli.
 *
 * Vazifa: dashboard fayl tushishini kutib o'tirmasdan, ulangan manbalardan
 * O'ZI ma'lumot tortadi va natijani barcha ochiq clientlarga SSE orqali yetkazadi.
 *
 * Manbalar:
 *   - Meta Ads      → Graph API (META_ACCESS_TOKEN + META_AD_ACCOUNT_ID)
 *   - Google Ads    → API (GOOGLE_ADS_* env — shared/googleAdsApi)
 *   - Telegram      → TGStat API (TGSTAT_TOKEN) — kanallar + postlar
 *   - AmoCRM        → push (webhook) — bu yerda pull yo'q, lekin yangi leadlar
 *                     activity feed + SSE orqali real-time ko'rinadi
 *   - Offline       → qo'lda kiritiladi (API orqali), o'zgarish broadcast qilinadi
 *
 * Rejim: "server" (uzoq muddatli process) — scheduler ishlaydi (SYNC_INTERVAL_SEC,
 * default 300s). "serverless" (Vercel) — scheduler yo'q, lekin POST /api/sync
 * chaqirilsa bir martalik pull qiladi (fayl yozish imkonsiz bo'lsa natija
 * faqat xotirada/activity'da ko'rinadi).
 */
import fs from "fs";
import path from "path";
import {
  currentSyncState,
  getStore,
  logActivity,
  recordSyncResults,
  syncIntervalSec,
  updateSyncState,
} from "./store";
import { DATA_DIR, canWriteSnapshots } from "./paths";
import { loadMetaConfigFromEnv, metaConfigured, pullMetaSnapshot } from "@shared/metaApi";
import { loadConfigFromEnv, pullAllAndWrite, type GoogleAdsConfig } from "@shared/googleAdsApi";
import type { SyncResultItem } from "@shared/types";

/* Broadcast — app.ts da ro'yxatdan o'tkaziladi (circular import oldini olish uchun) */
type Broadcaster = (event: string, payload?: unknown) => void;
let broadcast: Broadcaster | null = null;

export function setSyncBroadcaster(fn: Broadcaster) {
  broadcast = fn;
}

function emit(event: string, payload?: unknown) {
  broadcast?.(event, payload);
}

/** Telegram kanallarini TGStat'dan yangilash — routes/telegram da implementatsiya */
let telegramSyncer: (() => Promise<{ channels: number; posts: number }>) | null = null;

export function registerTelegramSyncer(fn: () => Promise<{ channels: number; posts: number }>) {
  telegramSyncer = fn;
}

/* ------------------------------------------------------------------ */
/* Bitta manba pull                                                    */
/* ------------------------------------------------------------------ */

async function syncMeta(): Promise<SyncResultItem> {
  const started = Date.now();
  const at = new Date().toISOString();
  const base = { id: "meta", label: "Meta Ads", at };
  const cfg = loadMetaConfigFromEnv();
  if (!cfg) {
    return { ...base, ok: false, message: "META_ACCESS_TOKEN / META_AD_ACCOUNT_ID yo'q", durationMs: 0 };
  }
  try {
    const res = await pullMetaSnapshot(cfg);
    if (!canWriteSnapshots()) {
      return {
        ...base,
        ok: false,
        message: "Ma'lumot keldi, lekin bu muhitda snapshot yozib bo'lmaydi (serverless)",
        durationMs: Date.now() - started,
      };
    }
    const file = path.join(DATA_DIR, res.fileName);
    fs.writeFileSync(file, JSON.stringify(res.doc, null, 2), "utf-8");
    logActivity({
      kind: "snapshot",
      source: "meta",
      tone: "good",
      title: "Meta Ads yangilandi",
      body: `${res.doc.campaigns.length} kampaniya · ${path.basename(file)}`,
    });
    return {
      ...base,
      ok: true,
      message: `${res.doc.campaigns.length} kampaniya, ${res.doc.adInsights.length} kreativ (${res.account.name})`,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logActivity({ kind: "error", source: "meta", tone: "risk", title: "Meta sync xatosi", body: message });
    return { ...base, ok: false, message, durationMs: Date.now() - started };
  }
}

async function syncGoogle(): Promise<SyncResultItem> {
  const started = Date.now();
  const at = new Date().toISOString();
  const base = { id: "google-ads", label: "Google Ads", at };
  let cfg: GoogleAdsConfig | null = null;
  try {
    cfg = loadConfigFromEnv();
  } catch {
    cfg = null;
  }
  if (!cfg) {
    return { ...base, ok: false, message: "GOOGLE_ADS_* env to'liq emas", durationMs: 0 };
  }
  try {
    const files = await pullAllAndWrite(cfg);
    logActivity({
      kind: "snapshot",
      source: "google-ads",
      tone: "good",
      title: "Google Ads yangilandi",
      body: `${files.length} kabinet snapshot yozildi`,
    });
    return {
      ...base,
      ok: true,
      message: `${files.length} snapshot yozildi`,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logActivity({ kind: "error", source: "google-ads", tone: "risk", title: "Google Ads sync xatosi", body: message });
    return { ...base, ok: false, message, durationMs: Date.now() - started };
  }
}

async function syncTelegram(): Promise<SyncResultItem> {
  const started = Date.now();
  const at = new Date().toISOString();
  const base = { id: "telegram", label: "Telegram", at };
  const channels = getStore().channels.length;
  if (!process.env.TGSTAT_TOKEN) {
    return { ...base, ok: false, message: "TGSTAT_TOKEN yo'q", durationMs: 0 };
  }
  if (channels === 0) {
    return { ...base, ok: false, message: "Kanallar qo'shilmagan", durationMs: 0 };
  }
  if (!telegramSyncer) {
    return { ...base, ok: false, message: "Telegram sync moduli yuklanmagan", durationMs: 0 };
  }
  try {
    const res = await telegramSyncer();
    logActivity({
      kind: "channel",
      source: "telegram",
      tone: "good",
      title: "Telegram kanallar yangilandi",
      body: `${res.channels} kanal · ${res.posts} post TGStat'dan tortildi`,
    });
    return {
      ...base,
      ok: true,
      message: `${res.channels} kanal, ${res.posts} post yangilandi`,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logActivity({ kind: "error", source: "telegram", tone: "risk", title: "Telegram sync xatosi", body: message });
    return { ...base, ok: false, message, durationMs: Date.now() - started };
  }
}

/* ------------------------------------------------------------------ */
/* Umumiy sync                                                         */
/* ------------------------------------------------------------------ */

let inFlight = false;

export async function runSync(trigger: "auto" | "manual" | "startup"): Promise<SyncResultItem[]> {
  if (inFlight) {
    logActivity({
      kind: "sync",
      source: "sync-engine",
      tone: "warn",
      title: "Sync allaqachon ishlayapti — o'tkazib yuborildi",
    });
    return currentSyncState().results;
  }
  inFlight = true;
  updateSyncState({ running: true, trigger });
  logActivity({
    kind: "sync",
    source: "sync-engine",
    title: trigger === "manual" ? "Qo'lda sync boshlandi" : "Avtomatik sync boshlandi",
    body: "Ulangan manbalardan yangi ma'lumot tortilmoqda…",
  });

  const results = await Promise.allSettled([syncMeta(), syncGoogle(), syncTelegram()]).then(rs =>
    rs.map(r => (r.status === "fulfilled" ? r.value : null)).filter((r): r is SyncResultItem => r != null)
  );

  recordSyncResults(results, trigger);
  const okCount = results.filter(r => r.ok).length;
  logActivity({
    kind: "sync",
    source: "sync-engine",
    tone: okCount > 0 ? "good" : "warn",
    title: `Sync tugadi — ${okCount}/${results.length} manba yangilandi`,
    body: results.map(r => `${r.label}: ${r.message}`).join(" · "),
  });
  // Barcha clientlar yangi snapshotlarni qayta o'qiydi
  emit("sync", { at: new Date().toISOString(), source: "sync-engine", trigger });
  inFlight = false;
  return results;
}

/* ------------------------------------------------------------------ */
/* Scheduler (faqat "server" rejimida)                                 */
/* ------------------------------------------------------------------ */

let schedulerStarted = false;

export function startSyncScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const interval = syncIntervalSec();
  const now = new Date();
  updateSyncState({
    intervalSec: interval,
    nextSyncAt: new Date(now.getTime() + Math.min(interval, 15) * 1000).toISOString(),
  });
  // Ishga tushgach 10s dan keyin birinchi sync (server to'liq ko'tarilishi uchun)
  setTimeout(() => void runSync("startup"), 10_000);
  const timer = setInterval(() => void runSync("auto"), interval * 1000);
  // Process tugasa interval to'xtasin
  timer.unref?.();
  console.log(
    `[sync] scheduler ishga tushdi: har ${interval}s · Meta:${metaConfigured() ? "ON" : "off"} · Google:${currentSyncState().configured.google ? "ON" : "off"} · Telegram:${process.env.TGSTAT_TOKEN ? "ON" : "off"}`
  );
}
