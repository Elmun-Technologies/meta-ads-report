/**
 * Real-time sync dvigateli.
 *
 * Vazifa: dashboard fayl tushishini kutib o'tirmasdan, ulangan manbalardan
 * O'ZI ma'lumot tortadi va natijani barcha ochiq clientlarga SSE orqali yetkazadi.
 *
 * Manbalar (ustuvorlik tartibida):
 *   1. OAuth ulanishlari — foydalanuvchining O'Z akkauntlari:
 *      Meta (bir nechta kabinet), Google Ads (bir nechta customer), AmoCRM (API pull)
 *   2. Env kalitlari — META_ACCESS_TOKEN / GOOGLE_ADS_* / TGSTAT_TOKEN (eski usul, hali ishlaydi)
 *   3. Telegram kanallar — TGStat API
 *   4. Snapshot fayllari — odam qo'lda tashlagan eksportlar (fs.watch orqali live)
 *
 * Rejim: "server" (uzoq muddatli process) — scheduler ishlaydi (SYNC_INTERVAL_SEC,
 * default 300s). "serverless" (Vercel) — scheduler yo'q, lekin POST /api/sync
 * chaqirilsa bir martalik pull qiladi.
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
import {
  loadConfigFromEnv,
  GoogleAdsClient,
  pullCustomer,
  buildSnapshotDoc,
  GOOGLE_ADS_API_VERSION,
  type GoogleAdsConfig,
} from "@shared/googleAdsApi";
import { loadAmoAppCredentials, ensureFreshToken, pullAmoSnapshot } from "@shared/amoApi";
import { activeConnections, markSynced, setConnectionStatus, upsertConnection } from "./connections";
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
/* Yordamchi — snapshot yozish                                         */
/* ------------------------------------------------------------------ */

function writeSnapshot(file: string, doc: unknown): boolean {
  if (!canWriteSnapshots()) return false;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(doc, null, 2), "utf-8");
  return true;
}

/* ------------------------------------------------------------------ */
/* Meta — OAuth ulanishlari (bir nechta kabinet) + env                 */
/* ------------------------------------------------------------------ */

async function syncMeta(): Promise<SyncResultItem> {
  const started = Date.now();
  const at = new Date().toISOString();
  const base = { id: "meta", label: "Meta Ads", at };
  const conns = activeConnections("meta");
  const envCfg = loadMetaConfigFromEnv();
  if (conns.length === 0 && !envCfg) {
    return { ...base, ok: false, message: "Facebook ulanmagan — Ulanishlar sahifasida «Facebook bilan ulash»", durationMs: 0 };
  }

  let okCount = 0;
  let totalCampaigns = 0;
  const errors: string[] = [];

  // 1) OAuth ulanishlari — har bir yoqilgan kabinet alohida fayl
  for (const conn of conns) {
    const enabled = conn.accounts.filter(a => a.enabled);
    if (conn.accounts.length > 0 && enabled.length === 0) continue;
    for (const acc of enabled) {
      try {
        const res = await pullMetaSnapshot({
          accessToken: conn.accessToken!,
          adAccountId: acc.id,
          days: Number(process.env.META_DAYS || 30),
          apiVersion: process.env.META_API_VERSION || "v21.0",
        });
        const file = `meta_act-${acc.id}_${res.doc.account.period.split(" — ").join("_")}.json`;
        if (writeSnapshot(file, res.doc)) {
          okCount++;
          totalCampaigns += res.doc.campaigns.length;
          markSynced(conn.id, acc.id);
        } else {
          errors.push(`${acc.name}: yozib bo'lmadi (serverless)`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${acc.name}: ${message.slice(0, 120)}`);
        if (/token|authorize|expired|session/i.test(message)) {
          setConnectionStatus(conn.id, "expired", "Token eskirgan — qayta ulang");
        }
      }
    }
  }

  // 2) Eski env usuli (agar bor bo'lsa va OAuth'da xuddi shu kabinet yo'q bo'lsa)
  if (envCfg && !conns.some(c => c.accounts.some(a => a.id === envCfg!.adAccountId))) {
    try {
      const res = await pullMetaSnapshot(envCfg);
      const file = `meta_act-${envCfg.adAccountId}_${res.doc.account.period.split(" — ").join("_")}.json`;
      if (writeSnapshot(file, res.doc)) {
        okCount++;
        totalCampaigns += res.doc.campaigns.length;
      }
    } catch (err) {
      errors.push(`env: ${(err as Error).message.slice(0, 120)}`);
    }
  }

  const ok = okCount > 0;
  const message = ok
    ? `${okCount} kabinet yangilandi · ${totalCampaigns} kampaniya${errors.length ? ` · ${errors.length} xato` : ""}`
    : errors[0] ?? "Kabinet yo'q";
  if (ok) {
    logActivity({
      kind: "snapshot",
      source: "meta",
      tone: errors.length ? "warn" : "good",
      title: "Meta Ads yangilandi",
      body: message,
    });
  }
  return { ...base, ok, message, durationMs: Date.now() - started };
}

/* ------------------------------------------------------------------ */
/* Google Ads — OAuth ulanishlari + env                                */
/* ------------------------------------------------------------------ */

async function syncGoogle(): Promise<SyncResultItem> {
  const started = Date.now();
  const at = new Date().toISOString();
  const base = { id: "google-ads", label: "Google Ads", at };
  const conns = activeConnections("google-ads");

  let envCfg: GoogleAdsConfig | null = null;
  try {
    envCfg = loadConfigFromEnv();
  } catch {
    envCfg = null;
  }
  if (conns.length === 0 && !envCfg) {
    return { ...base, ok: false, message: "Google Ads ulanmagan — «Google bilan ulash»", durationMs: 0 };
  }

  let okCount = 0;
  let totalCampaigns = 0;
  const errors: string[] = [];
  const dateRange = process.env.GOOGLE_ADS_DATE_RANGE || "LAST_30_DAYS";
  const currency = process.env.GOOGLE_ADS_CURRENCY || "USD";

  for (const conn of conns) {
    if (!conn.refreshToken) continue;
    const enabled = conn.accounts.filter(a => a.enabled);
    if (conn.accounts.length > 0 && enabled.length === 0) continue;
    try {
      const client = new GoogleAdsClient({
        developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
        clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
        refreshToken: conn.refreshToken,
        managerId: process.env.GOOGLE_ADS_MANAGER_ID || undefined,
        customerIds: enabled.map(a => a.id),
        useTestAccount: process.env.GOOGLE_ADS_USE_TEST_ACCOUNT === "true",
        dateRange,
        currency,
        apiVersion: process.env.GOOGLE_ADS_API_VERSION || GOOGLE_ADS_API_VERSION,
      });
      for (const acc of enabled) {
        try {
          const p = await pullCustomer(client, acc.id, dateRange, currency);
          const stamp = new Date().toISOString().slice(0, 10);
          const file = `google_${acc.id.replace(/\D/g, "")}_${stamp}.json`;
          const doc = buildSnapshotDoc(p, { filename: file, now: new Date().toISOString() });
          if (writeSnapshot(file, doc)) {
            okCount++;
            totalCampaigns += p.campaigns.length;
            markSynced(conn.id, acc.id);
            // Kabinet nomini boyitamiz (topilganda)
            if (p.customer?.name && acc.name.startsWith("Google Ads")) {
              acc.name = p.customer.name;
            }
          }
        } catch (err) {
          errors.push(`${acc.id}: ${(err as Error).message.slice(0, 120)}`);
        }
      }
    } catch (err) {
      const message = (err as Error).message;
      errors.push(message.slice(0, 150));
      if (/refresh token/i.test(message)) {
        setConnectionStatus(conn.id, "expired", "Google token eskirgan — qayta ulang");
      }
    }
  }

  // Eski env usuli (OAuth'da xuddi shu customer yo'q bo'lsa)
  if (envCfg && envCfg.customerIds.length > 0) {
    const oauthIds = new Set(conns.flatMap(c => c.accounts.map(a => a.id)));
    const missing = envCfg.customerIds.filter(cid => !oauthIds.has(cid));
    if (missing.length > 0) {
      try {
        const client = new GoogleAdsClient({ ...envCfg, customerIds: missing });
        for (const cid of missing) {
          const p = await pullCustomer(client, cid, envCfg.dateRange, envCfg.currency);
          const stamp = new Date().toISOString().slice(0, 10);
          const file = `google_${cid.replace(/\D/g, "")}_${stamp}.json`;
          const doc = buildSnapshotDoc(p, { filename: file, now: new Date().toISOString() });
          if (writeSnapshot(file, doc)) {
            okCount++;
            totalCampaigns += p.campaigns.length;
          }
        }
      } catch (err) {
        errors.push(`env: ${(err as Error).message.slice(0, 120)}`);
      }
    }
  }

  const ok = okCount > 0;
  const message = ok
    ? `${okCount} kabinet yangilandi · ${totalCampaigns} kampaniya${errors.length ? ` · ${errors.length} xato` : ""}`
    : errors[0] ?? "Kabinet yo'q";
  if (ok) {
    logActivity({
      kind: "snapshot",
      source: "google-ads",
      tone: errors.length ? "warn" : "good",
      title: "Google Ads yangilandi",
      body: message,
    });
  }
  return { ...base, ok, message, durationMs: Date.now() - started };
}

/* ------------------------------------------------------------------ */
/* AmoCRM — OAuth ulanishi (API pull) + Telegram                       */
/* ------------------------------------------------------------------ */

async function syncAmoCrm(): Promise<SyncResultItem> {
  const started = Date.now();
  const at = new Date().toISOString();
  const base = { id: "amocrm", label: "AmoCRM", at };
  const app = loadAmoAppCredentials();
  const conns = activeConnections("amocrm");
  if (!app || conns.length === 0) {
    return { ...base, ok: false, message: "AmoCRM ulanmagan — «AmoCRM ulash»", durationMs: 0 };
  }

  let okCount = 0;
  let totalLeads = 0;
  const errors: string[] = [];

  for (const conn of conns) {
    if (!conn.accessToken || !conn.refreshToken || !conn.subdomain) continue;
    try {
      let tokens = {
        accessToken: conn.accessToken,
        refreshToken: conn.refreshToken,
        tokenExpiresAt: conn.tokenExpiresAt ?? new Date(0).toISOString(),
        subdomain: conn.subdomain,
      };
      // Tokenni yangilab, ulanishda saqlaymiz
      tokens = await ensureFreshToken(app, tokens);
      const raw = await pullAmoSnapshot(tokens);
      const stamp = new Date().toISOString().slice(0, 10);
      const file = `amo_${conn.subdomain}_${stamp}.json`;
      const doc = {
        ...raw,
        syncedNote: `API pull · ${new Date().toISOString()}`,
      };
      if (writeSnapshot(file, doc)) {
        okCount++;
        totalLeads += raw.leads?.length ?? 0;
        markSynced(conn.id);
        // Yangi tokenlarni saqlash
        setConnectionTokens(conn.id, tokens);
      }
    } catch (err) {
      const message = (err as Error).message;
      errors.push(`${conn.subdomain}: ${message.slice(0, 120)}`);
      if (/token|refresh|unauthor/i.test(message)) {
        setConnectionStatus(conn.id, "expired", "AmoCRM token eskirgan — qayta ulang");
      }
    }
  }

  const ok = okCount > 0;
  const message = ok
    ? `${okCount} hisob · ${totalLeads} lead API'dan tortildi`
    : errors[0] ?? "Hisob yo'q";
  if (ok) {
    logActivity({
      kind: "snapshot",
      source: "amocrm",
      tone: "good",
      title: "AmoCRM yangilandi",
      body: message,
    });
  }
  return { ...base, ok, message, durationMs: Date.now() - started };
}

function setConnectionTokens(id: string, tokens: { accessToken: string; refreshToken: string; tokenExpiresAt: string }) {
  upsertConnection({ id, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, tokenExpiresAt: tokens.tokenExpiresAt } as any);
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

  const results = await Promise.allSettled([syncMeta(), syncGoogle(), syncAmoCrm(), syncTelegram()]).then(rs =>
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
  const oauthCount = activeConnections().length;
  console.log(
    `[sync] scheduler ishga tushdi: har ${interval}s · OAuth ulanishlar: ${oauthCount} · Meta(env):${metaConfigured() ? "ON" : "off"} · Telegram:${process.env.TGSTAT_TOKEN ? "ON" : "off"}`
  );
}
