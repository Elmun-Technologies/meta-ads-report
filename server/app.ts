/**
 * Express ilova qurilmasi — bir xil route'lar ikki rejimda ishlaydi:
 *   - "server": uzoq muddatli process (Railway/Render/VPS) — fs.watch + SSE + sync scheduler + statik client serve qiladi.
 *   - "serverless": Vercel funksiyasi (api/[[...slug]].ts) — faqat /api/* route'lar.
 *
 * Arxitektura:
 *   snapshots/ papka  →  Connector (normalize)  →  /api/snapshot  →  UI
 *   Sync dvigateli    →  Meta/Google/TGStat API pull  →  snapshot + SSE push
 *   AmoCRM webhook    →  /api/webhooks/amocrm  →  store + SSE push (real-time leadlar)
 *   Yangi snapshot tushsa → /api/stream (SSE, faqat "server" rejimida) → barcha clientlar live yangilanadi.
 *
 * Yangi platforma (Google Ads, Yandex Direct MCP) ulash uchun CONNECTORS ga
 * yangi connector qo'shiladi — UI umumiy NormalizedSnapshot modeli ustida ishlaydi.
 */
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeMetaExport, type RawMetaExport } from "@shared/normalize";
import { normalizeGenericAds } from "@shared/generic";
import {
  matchLeadsToAds,
  normalizeAmoExport,
  type RawAmoExport,
} from "@shared/amo";
import { metaConfigured } from "@shared/metaApi";
import type {
  ConnectionInfo,
  CrmData,
  CrmLead,
  CrmStage,
  NormalizedSnapshot,
  PlatformId,
  PlatformTotals,
  SnapshotInfo,
} from "@shared/types";
import { webhooksRouter } from "./routes/webhooks";
import { offlineChannelsRouter } from "./routes/offline-channels";
import { telegramRouter, getTelegramStats } from "./routes/telegram";
import {
  getStore,
  currentSyncState,
  logActivity,
  recentActivity,
  setBroadcaster,
} from "./store";
import { runSync, setSyncBroadcaster } from "./sync";
import { DATA_DIR } from "./paths";

export { DATA_DIR };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------------------------------------------ */
/* Connector layer                                                     */
/* ------------------------------------------------------------------ */

interface Connector {
  id: PlatformId;
  name: string;
  vendor: string;
  note?: string;
  /** Sync dvigateli bu manbadan avtomatik tortadi (env sozlanganda) */
  autoSync?: boolean;
  /** Papkadagi eng yangi snapshot fayli */
  latestFile?: () => { file: string; mtime: Date } | null;
  resolve: (file?: string) => NormalizedSnapshot | null;
}

function platformForFile(file: string): PlatformId {
  if (file.startsWith("google")) return "google-ads";
  if (file.startsWith("yandex")) return "yandex-direct";
  return "meta";
}

function latestFileFor(
  prefix: "meta" | "google" | "yandex" | "amo"
): { file: string; mtime: Date } | null {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs
    .readdirSync(DATA_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith(".json"))
    .map(file => ({
      file: path.join(DATA_DIR, file),
      mtime: fs.statSync(path.join(DATA_DIR, file)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files[0] ?? null;
}

const latestMetaFile = () => latestFileFor("meta");

export function readMetaSnapshot(file?: string): NormalizedSnapshot | null {
  const target = file
    ? path.join(DATA_DIR, path.basename(file))
    : latestMetaFile()?.file;
  if (!target || !fs.existsSync(target)) return null;
  try {
    const mtime = fs.statSync(target).mtime;
    const raw = JSON.parse(fs.readFileSync(target, "utf-8")) as RawMetaExport;
    return normalizeMetaExport(raw, {
      syncedAt: mtime.toISOString(),
      sourceLabel: `Meta Ads MCP snapshot · ${path.basename(target)}`,
      file: path.basename(target),
    });
  } catch (err) {
    console.error("[meta] snapshot o'qishda xato:", err);
    return null;
  }
}

/** Google Ads / Yandex Direct — universal alias normalizer orqali, aniq fayl bo'yicha */
function readGenericSnapshotFile(
  platform: "google-ads" | "yandex-direct",
  target: string,
  mtime: Date
): NormalizedSnapshot | null {
  try {
    const raw = JSON.parse(fs.readFileSync(target, "utf-8"));
    return normalizeGenericAds(raw, {
      platform,
      syncedAt: mtime.toISOString(),
      file: path.basename(target),
    });
  } catch (err) {
    console.error(
      `[${platform}] snapshot o'qishda xato:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/** Google Ads / Yandex Direct — eng yangi snapshot */
function readGenericSnapshot(
  platform: "google-ads" | "yandex-direct"
): NormalizedSnapshot | null {
  const prefix = platform === "google-ads" ? "google" : "yandex";
  const latest = latestFileFor(prefix);
  if (!latest) return null;
  return readGenericSnapshotFile(platform, latest.file, latest.mtime);
}

/** Barcha snapshot fayllari ro'yxati — davrlararo taqqoslash uchun */
export function listSnapshots(): SnapshotInfo[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter(f => f.endsWith(".json"))
    .map(file => {
      try {
        const full = path.join(DATA_DIR, file);
        const raw = JSON.parse(fs.readFileSync(full, "utf-8")) as any;
        return {
          file,
          platform: platformForFile(file),
          accountName:
            raw.account?.name ??
            raw.account_name ??
            raw.Login ??
            raw.name ??
            "—",
          periodLabel:
            raw.account?.period ?? raw.period ?? raw.date_range ?? "—",
          syncedAt: fs.statSync(full).mtime.toISOString(),
        } satisfies SnapshotInfo;
      } catch {
        return null;
      }
    })
    .filter((s): s is SnapshotInfo => s != null)
    .sort((a, b) => b.syncedAt.localeCompare(a.syncedAt));
}

/* ---------------- AmoCRM (lead lifecycle) ---------------- */

function latestAmoFile(): { file: string; mtime: Date } | null {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs
    .readdirSync(DATA_DIR)
    .filter(f => f.startsWith("amo") && f.endsWith(".json"))
    .map(file => ({
      file: path.join(DATA_DIR, file),
      mtime: fs.statSync(path.join(DATA_DIR, file)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files[0] ?? null;
}

export function readAmoSnapshot(): CrmData | null {
  const latest = latestAmoFile();
  if (!latest) return null;
  try {
    const raw = JSON.parse(
      fs.readFileSync(latest.file, "utf-8")
    ) as RawAmoExport;
    const crm = normalizeAmoExport(raw, {
      syncedAt: latest.mtime.toISOString(),
      file: path.basename(latest.file),
    });
    return matchLeadsToAds(crm, readMetaSnapshot());
  } catch (err) {
    console.error("[amo] snapshot o'qishda xato:", err);
    return null;
  }
}

/**
 * CRM ma'lumoti — birlashtirilgan manba:
 *   1. amo_*.json snapshot (MCP/eksport)
 *   2. Store'dagi webhook leadlari (AmoCRM real-time)
 *   3. Store'dagi offline leadlar
 * Shunda CRM real-time: webhook kelsi — Pipeline sahifasi darhol yangilanadi.
 */
export function readCrmUnified(): CrmData | null {
  const fileCrm = readAmoSnapshot();
  const store = getStore();
  const storeLeads = store.leads;

  if (!fileCrm && storeLeads.length === 0) return null;

  // Store leadlarini CrmLead shaklida jamlash
  const fromStore: CrmLead[] = storeLeads.map(l => ({
    id: l.id,
    name: l.name,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    stageId: l.stageId,
    stageName: l.stageName,
    pipeline: l.pipeline,
    price: l.price,
    responsible: l.responsible ?? null,
    contactName: l.contactName ?? null,
    phone: l.phone ?? null,
    utmCampaign: l.utmCampaign ?? null,
    utmContent: l.utmContent ?? null,
    utmSource: l.utmSource ?? null,
    campaignId: null,
    creativeId: null,
    history: l.history.map(h => ({ at: h.at, stage: h.stage })),
    lossReason: l.lossReason ?? null,
  }));

  // Store leadlarining bosqichlari (sintetik ro'yxat)
  const stageIds = [...new Set(storeLeads.map(l => l.stageId))];
  const synthStages: CrmStage[] = stageIds.map((id, i) => {
    const sample = storeLeads.find(l => l.stageId === id)!;
    const name = sample.stageName;
    const n = name.toLowerCase();
    const kind: CrmStage["kind"] =
      n.includes("won") || n.includes("bitim") || n.includes("yutuq") || n.includes("успешн")
        ? "won"
        : n.includes("lost") || n.includes("rad") || n.includes("yo'qot") || n.includes("проигр")
          ? "lost"
          : i === 0
            ? "new"
            : "in_progress";
    return { id, name, pipeline: sample.pipeline, sort: 100 + i, kind };
  });

  if (!fileCrm) {
    // Faqat webhook/offline leadlar mavjud
    const crm: CrmData = {
      account: "AmoCRM (webhook) + Offline",
      currency: process.env.AMOCRM_CURRENCY || "UZS",
      syncedAt: new Date().toISOString(),
      sourceLabel: "Real-time (webhook + offline)",
      stages: synthStages,
      leads: fromStore,
      matchedLeads: 0,
      unmatchedLeads: fromStore.length,
    };
    return matchLeadsToAds(crm, readMetaSnapshot());
  }

  // Ikkalasini birlashtirish — webhook lead fayldagi lead bilan bir xil id'da bo'lsa, webhook yangiroq
  const byId = new Map(fileCrm.leads.map(l => [l.id, l]));
  for (const l of fromStore) byId.set(l.id, l);
  const merged: CrmData = {
    ...fileCrm,
    syncedAt: new Date().toISOString(),
    sourceLabel: `${fileCrm.sourceLabel} + real-time webhook`,
    stages: [...fileCrm.stages, ...synthStages.filter(s => !fileCrm.stages.some(fs => fs.id === s.id))],
    leads: [...byId.values()],
  };
  const matched = merged.leads.filter(l => l.utmCampaign).length;
  merged.matchedLeads = matched;
  merged.unmatchedLeads = merged.leads.length - matched;
  return matchLeadsToAds(merged, readMetaSnapshot());
}

const CONNECTORS: Connector[] = [
  {
    id: "meta",
    name: "Meta Ads",
    vendor: "Facebook / Instagram",
    note: metaConfigured()
      ? "Real-time: Graph API'dan har sync intervalda avtomatik tortiladi (META_ACCESS_TOKEN sozlangan)."
      : "META_ACCESS_TOKEN + META_AD_ACCOUNT_ID berilsa — real-time Graph API pull yoqiladi. Aks holda meta_*.json eksporti papkaga tushganda ulanadi.",
    autoSync: metaConfigured(),
    latestFile: latestMetaFile,
    resolve: () => readMetaSnapshot(),
  },
  {
    id: "google-ads",
    name: "Google Ads",
    vendor: "Google",
    note: "GOOGLE_ADS_* env to'ldirilsa — API'dan avtomatik tortiladi. Aks holda google_*.json snapshot papkaga tushganda avtomatik ulanadi.",
    autoSync: Boolean(
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_REFRESH_TOKEN
    ),
    latestFile: () => latestFileFor("google"),
    resolve: () => readGenericSnapshot("google-ads"),
  },
  {
    id: "yandex-direct",
    name: "Yandex Direct",
    vendor: "Yandex",
    note: "yandex_*.json snapshot papkaga tushganda avtomatik ulanadi (Name, Spend, Clicks, Conversions maydonlari taniladi — README).",
    latestFile: () => latestFileFor("yandex"),
    resolve: () => readGenericSnapshot("yandex-direct"),
  },
];

/** Har bir ulangan platforma uchun eng yangi snapshot — statik bootstrap uchun (build-static-data.ts) */
export function readSnapshotsByPlatform(): Partial<Record<PlatformId, NormalizedSnapshot>> {
  const out: Partial<Record<PlatformId, NormalizedSnapshot>> = {};
  for (const c of CONNECTORS) {
    const snap = c.resolve();
    if (snap) out[c.id] = snap;
  }
  return out;
}

const CRM_CONNECTIONS: ConnectionInfo[] = [
  {
    id: "amocrm",
    name: "AmoCRM",
    vendor: "amoCRM — lead lifecycle",
    kind: "crm",
    status: "ready",
    accounts: [],
    syncedAt: null,
    note: "amo_*.json snapshot + /api/webhooks/amocrm (real-time). Webhook ulansa leadlar darhol ko'rinadi.",
  },
];

export function connectionsPayload(): ConnectionInfo[] {
  const crm = readCrmUnified();
  const amoInfo: ConnectionInfo = {
    ...CRM_CONNECTIONS[0],
    status: crm ? "connected" : "ready",
    accounts: crm
      ? [{ id: crm.account, name: crm.account, currency: crm.currency }]
      : [],
    syncedAt: crm?.syncedAt ?? null,
  };
  return [
    ...CONNECTORS.map(c => {
      const snapshot = c.resolve();
      const latest = c.latestFile?.();
      return {
        id: c.id,
        kind: "ads" as const,
        name: c.name,
        vendor: c.vendor,
        status: snapshot ? "connected" : "ready",
        accounts: snapshot
          ? [
              {
                id: snapshot.meta.account.id,
                name: snapshot.meta.account.name,
                currency: snapshot.meta.account.currency,
                externalId: snapshot.meta.account.externalId,
              },
            ]
          : [],
        syncedAt: latest?.mtime.toISOString() ?? null,
        note: c.note,
        autoSync: c.autoSync,
      } satisfies ConnectionInfo;
    }),
    amoInfo,
  ];
}

/* ------------------------------------------------------------------ */
/* SSE — live sync kanali (faqat "server" rejimda ishlaydi)            */
/* ------------------------------------------------------------------ */

const sseClients = new Set<import("http").ServerResponse>();

export function broadcast(event: string, data: unknown = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

// Store (activity, sync_state) va sync dvigateli SSE'ga ulanadi
setBroadcaster(broadcast);
setSyncBroadcaster(broadcast);

/** Snapshot papkasini kuzatadi va SSE orqali ulangan clientlarga push qiladi. Faqat uzoq muddatli process'da chaqiriladi. */
export function watchSnapshots() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  let debounce: NodeJS.Timeout | null = null;
  fs.watch(DATA_DIR, { persistent: false }, (_event, filename) => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      const name = filename ? String(filename) : null;
      if (name && name.endsWith(".json")) {
        logActivity({
          kind: "snapshot",
          source: "snapshots-dir",
          tone: "good",
          title: `Yangi snapshot: ${name}`,
          body: "Fayl papkaga tushdi — dashboard yangilanmoqda",
        });
      }
      const latest = latestMetaFile();
      broadcast("sync", {
        at: new Date().toISOString(),
        source: "snapshots-dir",
        file: latest ? path.basename(latest.file) : null,
      });
    }, 400);
  });
}

/* ------------------------------------------------------------------ */
/* Yagona oyna — platformalar kesimi                                   */
/* ------------------------------------------------------------------ */

/** Har bir platformaning jamlangan ko'rsatkichlari + nima ma'lumligi */
function platformTotalsFor(
  platform: PlatformId,
  snap: NormalizedSnapshot | null,
  autoSync: boolean,
  coverage: string[],
  limitations: string[]
): PlatformTotals {
  const names: Partial<Record<PlatformId, string>> = {
    meta: "Meta Ads",
    "google-ads": "Google Ads",
    "yandex-direct": "Yandex Direct",
    telegram: "Telegram",
    offline: "Offline",
  };
  const colors: Partial<Record<PlatformId, string>> = {
    meta: "#0866FF",
    "google-ads": "#4285F4",
    "yandex-direct": "#FC3F1D",
    telegram: "#0088cc",
    offline: "#10b981",
  };
  const t = snap?.totals;
  return {
    platform,
    name: names[platform] ?? platform,
    color: colors[platform] ?? "var(--text)",
    spend: t?.spend ?? 0,
    leads: t?.leads ?? 0,
    cpl: t?.cpl ?? null,
    impressions: t?.impressions ?? 0,
    clicks: t?.clicks ?? 0,
    ctr: t?.ctr ?? null,
    campaigns: snap?.campaigns.length ?? 0,
    syncedAt: snap?.meta.syncedAt ?? null,
    autoSync,
    coverage,
    limitations,
  };
}

export async function buildUnifiedSnapshot(): Promise<NormalizedSnapshot | null> {
  const byPlatform = readSnapshotsByPlatform();
  const snapshots: NormalizedSnapshot[] = [];
  const platforms: PlatformTotals[] = [];

  const metaSnap = byPlatform["meta"];
  if (metaSnap) {
    snapshots.push(metaSnap);
    platforms.push(
      platformTotalsFor(
        "meta",
        metaSnap,
        metaConfigured(),
        ["Sarf", "Murojaatlar", "Kliklar", "Ko'rsatuvlar", "Kreativlar", "Yosh kesimi"],
        metaSnap.meta.limitations
      )
    );
  } else {
    platforms.push(
      platformTotalsFor("meta", null, metaConfigured(), [], ["Hali ulanmagan"])
    );
  }

  const googleSnap = byPlatform["google-ads"];
  if (googleSnap) {
    snapshots.push(googleSnap);
    platforms.push(
      platformTotalsFor(
        "google-ads",
        googleSnap,
        Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_REFRESH_TOKEN),
        ["Sarf", "Konversiyalar (murojaat sifatida)", "Kliklar", "Ko'rsatuvlar", "Kampaniyalar"],
        googleSnap.meta.limitations
      )
    );
  } else {
    platforms.push(
      platformTotalsFor("google-ads", null, Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN), [], ["Hali ulanmagan"])
    );
  }

  const yandexSnap = byPlatform["yandex-direct"];
  if (yandexSnap) {
    snapshots.push(yandexSnap);
    platforms.push(
      platformTotalsFor("yandex-direct", yandexSnap, false, ["Sarf", "Kliklar", "Ko'rsatuvlar", "Konversiyalar"], yandexSnap.meta.limitations)
    );
  }

  /* Offline kampaniyalar — store'dan */
  const offlineCampaigns = getStore().offlineCampaigns;
  if (offlineCampaigns.length > 0) {
    const offSpend = offlineCampaigns.reduce((s, c) => s + (c.metrics.spend || 0), 0);
    const offLeads = offlineCampaigns.reduce((s, c) => s + (c.metrics.leadsCount || 0), 0);
    const offSnap: NormalizedSnapshot = {
      meta: {
        platform: "offline",
        period: { start: "", end: "", label: "Umumiy" },
        account: { id: "offline", name: "Offline manbalar", currency: process.env.OFFLINE_CURRENCY || "UZS" },
        sourceLabel: "Qo'lda kiritilgan (API)",
        syncedAt: new Date().toISOString(),
        limitations: [],
      },
      totals: {
        spend: offSpend,
        leads: offLeads,
        cpl: offLeads > 0 ? offSpend / offLeads : null,
        impressions: offlineCampaigns.reduce((s, c) => s + (c.metrics.impressions || 0), 0),
        clicks: offlineCampaigns.reduce((s, c) => s + (c.metrics.clicks || 0), 0),
        ctr: null,
        reach: null,
        frequency: null,
        linkClicks: offlineCampaigns.reduce((s, c) => s + (c.metrics.linkClicks || 0), 0),
        linkCtr: null,
        cpm: null,
        cpc: null,
        landingPageViews: null,
        messagingConversations: null,
        videoViews: null,
      },
      campaigns: offlineCampaigns.map(c => ({
        id: c.id,
        name: c.name,
        originalName: c.originalName,
        objective: c.objective,
        platform: "offline" as PlatformId,
        expo: c.expo,
        goal: c.goal,
        metrics: {
          spend: c.metrics.spend,
          leads: c.metrics.leadsCount,
          cpl: c.metrics.leadsCount > 0 ? c.metrics.spend / c.metrics.leadsCount : null,
          impressions: c.metrics.impressions,
          clicks: c.metrics.clicks,
          linkClicks: c.metrics.linkClicks,
          reach: null,
          frequency: null,
          ctr: null,
          linkCtr: null,
          cpc: null,
          cpm: null,
          landingPageViews: null,
          messagingConversations: null,
          videoViews: null,
        } satisfies NormalizedSnapshot["campaigns"][number]["metrics"],
        creatives: [],
      })),
      creatives: [],
      age: [],
    };
    snapshots.push(offSnap);
    platforms.push(
      platformTotalsFor("offline", offSnap, false, ["Sarf", "Murojaatlar (qo'lda)"], [])
    );
  }

  /* Telegram kanallar — TGStat'dan */
  const tgChannels = getTelegramStats();
  if (tgChannels.length > 0) {
    const tgCampaigns: NormalizedSnapshot["campaigns"] = [];
    let tgSpend = 0;
    let tgViews = 0;
    let tgReactions = 0;

    for (const ch of tgChannels) {
      const chSpend = ch.posts.reduce((s, p) => s + (p.cost || 0), 0);
      const chViews = ch.posts.reduce((s, p) => s + (p.views || 0), 0);
      const chReactions = ch.posts.reduce((s, p) => s + (p.reactions || 0), 0);

      tgSpend += chSpend;
      tgViews += chViews;
      tgReactions += chReactions;

      tgCampaigns.push({
        id: `tg-${ch.id}`,
        name: `${ch.name} (${ch.username})`,
        originalName: ch.name,
        objective: "telegram",
        platform: "telegram",
        expo: `${ch.subscribers} obunachi · ERR ${ch.errPercent}%`,
        goal: "engagement",
        metrics: {
          spend: chSpend,
          leads: 0,
          cpl: null,
          impressions: chViews,
          clicks: chReactions,
          reach: ch.avgPostReach,
          frequency: null,
          ctr: null,
          linkClicks: 0,
          linkCtr: null,
          cpc: null,
          cpm: null,
          landingPageViews: null,
          messagingConversations: null,
          videoViews: null,
          postEngagement: chReactions,
        },
        creatives: [],
      });
    }

    const tgSnap: NormalizedSnapshot = {
      meta: {
        platform: "telegram",
        period: { start: "", end: "", label: "Oxirgi postlar" },
        account: { id: "telegram", name: "Telegram kanallar", currency: process.env.TELEGRAM_CURRENCY || "UZS" },
        sourceLabel: `TGStat API · ${tgChannels.length} kanal`,
        syncedAt: tgChannels[0]?.syncedAt ?? new Date().toISOString(),
        limitations: ["Telegram'da bevosita lead yo'q — reaksiya/ko'rish metrikalari ko'rsatiladi."],
      },
      totals: {
        spend: tgSpend,
        leads: 0,
        cpl: null,
        impressions: tgViews,
        clicks: tgReactions,
        ctr: tgViews > 0 ? (tgReactions / tgViews) * 100 : null,
        reach: null,
        frequency: null,
        linkClicks: 0,
        linkCtr: null,
        cpm: null,
        cpc: null,
        landingPageViews: null,
        messagingConversations: null,
        videoViews: null,
      },
      campaigns: tgCampaigns,
      creatives: [],
      age: [],
    };
    snapshots.push(tgSnap);
    platforms.push(
      platformTotalsFor(
        "telegram",
        tgSnap,
        Boolean(process.env.TGSTAT_TOKEN),
        ["Post narxi (qo'lda)", "Ko'rishlar", "Reaksiyalar", "Obunachilar", "ERR"],
        tgSnap.meta.limitations
      )
    );
  }

  if (snapshots.length === 0) return null;

  // Jamlovchi hisoblagichlar — Metrics'dagi nullable maydonlardan farqli ravishda
  // bu yerda 0 dan boshlanadi (null = "ma'lumot yo'q" ma'nosini saqlash uchun
  // faqat manbada yo'q bo'lganda ishlatiladi).
  const totals = {
    spend: 0,
    leads: 0,
    cpl: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    reach: 0,
    cpm: 0,
    cpc: 0,
    landingPageViews: 0,
    linkClicks: 0,
    videoViews: 0,
    messagingConversations: 0,
    postEngagement: 0,
    reactions: 0,
    comments: 0,
    saves: 0,
    messagingFirstReply: 0,
  };
  const campaigns: NormalizedSnapshot["campaigns"] = [];
  const creatives: NormalizedSnapshot["creatives"] = [];
  const age: NormalizedSnapshot["age"] = [];

  for (const s of snapshots) {
    totals.spend += s.totals.spend || 0;
    totals.leads += s.totals.leads || 0;
    totals.impressions += s.totals.impressions || 0;
    totals.clicks += s.totals.clicks || 0;
    totals.reach += s.totals.reach || 0;
    totals.landingPageViews += s.totals.landingPageViews || 0;
    totals.linkClicks += s.totals.linkClicks || 0;
    totals.videoViews += s.totals.videoViews || 0;
    campaigns.push(...s.campaigns);
    creatives.push(...s.creatives);
    age.push(...s.age);
  }

  if (totals.leads > 0) totals.cpl = totals.spend / totals.leads;
  if (totals.impressions > 0) totals.ctr = (totals.clicks / totals.impressions) * 100;
  if (totals.impressions > 0) totals.cpm = (totals.spend / totals.impressions) * 1000;
  if (totals.clicks > 0) totals.cpc = totals.spend / totals.clicks;

  return {
    meta: {
      platform: "all" as PlatformId,
      period: snapshots[0].meta.period,
      account: { id: "all", name: "Jami — barcha manbalar", currency: snapshots[0].meta.account.currency },
      sourceLabel: "Yagona oyna — real-time",
      syncedAt: new Date().toISOString(),
      limitations: [],
    },
    totals: totals as NormalizedSnapshot["totals"],
    campaigns,
    creatives,
    age,
    platforms,
  };
}

/* ------------------------------------------------------------------ */
/* Express app                                                         */
/* ------------------------------------------------------------------ */

export type AppMode = "server" | "serverless";

export function createApp(mode: AppMode = "server") {
  const app = express();
  app.use(express.json({ limit: "20mb" }));

  app.use("/api/webhooks", webhooksRouter);
  app.use("/api/channels/offline", offlineChannelsRouter);
  app.use("/api/telegram", telegramRouter);

  // API CORS (dev proxy same-origin ishlatadi, lekin alohida deploymentda ham ishlashi uchun)
  app.use("/api", (_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  app.get("/api/health", (req, res) => {
    const files = fs.existsSync(DATA_DIR)
      ? fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"))
      : [];
    const debug =
      req.query.debug === "1"
        ? { dataDir: DATA_DIR, cwd: process.cwd(), files }
        : undefined;
    res.json({
      ok: true,
      mode,
      at: new Date().toISOString(),
      snapshots: files.length,
      ...(debug ? { debug } : null),
    });
  });

  app.get("/api/connections", (_req, res) => {
    res.json(connectionsPayload());
  });

  app.get("/api/snapshots", (_req, res) => {
    // A/B taqqoslash faqat reklama davr snapshotlari uchun (amo_* — CRM, alohida)
    res.json(listSnapshots().filter(s => !s.file.startsWith("amo")));
  });

  app.get("/api/crm", (_req, res) => {
    const crm = readCrmUnified();
    if (!crm) {
      res
        .status(503)
        .json({
          connected: false,
          error:
            "AmoCRM ma'lumoti topilmadi — server/data/snapshots/ ga amo_*.json qo'ying yoki webhook'ni ulang (/api/webhooks/amocrm).",
        });
      return;
    }
    res.json({ connected: true, ...crm });
  });

  /* ---------------- Real-time sync ---------------- */

  // Qo'lda sync — barcha ulangan manbalardan hoziroq tortadi
  app.post("/api/sync", async (_req, res) => {
    try {
      const results = await runSync("manual");
      res.json({ ok: true, at: new Date().toISOString(), results });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/api/sync", (_req, res) => {
    res.json(currentSyncState());
  });

  app.get("/api/activity", (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 120);
    res.json({ events: recentActivity(limit) });
  });

  app.get("/api/snapshot", async (req, res) => {
    const file = req.query.file ? String(req.query.file) : undefined;
    if (file) {
      const platform = platformForFile(path.basename(file));
      let snapshot: NormalizedSnapshot | null;
      if (platform === "meta") {
        snapshot = readMetaSnapshot(file);
      } else {
        const target = path.join(DATA_DIR, path.basename(file));
        snapshot = fs.existsSync(target)
          ? readGenericSnapshotFile(platform as "google-ads" | "yandex-direct", target, fs.statSync(target).mtime)
          : null;
      }
      if (!snapshot) {
        res.status(404).json({ error: `Snapshot topilmadi: ${file}` });
        return;
      }
      res.json(snapshot);
      return;
    }
    const platform = String(req.query.platform || "all") as PlatformId;

    if (platform === "all") {
      const unified = await buildUnifiedSnapshot();
      if (!unified) {
        res.status(503).json({ error: "Hali hech qanday manba ulanmagan" });
        return;
      }
      res.json(unified);
      return;
    }

    const connector = CONNECTORS.find(c => c.id === platform);
    if (!connector) {
      res.status(404).json({ error: `Unknown platform: ${platform}` });
      return;
    }
    const snapshot = connector.resolve(
      String(req.query.account || "") || undefined
    );
    if (!snapshot) {
      res
        .status(503)
        .json({
          error: `${connector.name} hali ulanmagan — snapshot topilmadi. server/data/snapshots/ ga eksport qo'ying.`,
        });
      return;
    }
    res.json(snapshot);
  });

  app.get("/api/stream", (req, res) => {
    if (mode === "serverless") {
      // Serverless funksiyalar uzoq muddatli ulanishni ushlab turolmaydi — client polling'ga o'tadi.
      res
        .status(501)
        .json({
          error:
            "SSE serverless rejimda qo'llab-quvvatlanmaydi — client polling fallback ishlatadi.",
        });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(`retry: 5000\n\n`);
    res.write(
      `event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString(), clients: sseClients.size + 1 })}\n\n`
    );
    // Ulangan zahari hozirgi sync holati + oxirgi activitylar ham yuboriladi
    res.write(`event: sync_state\ndata: ${JSON.stringify(currentSyncState())}\n\n`);
    for (const ev of recentActivity(12).reverse()) {
      res.write(`event: activity\ndata: ${JSON.stringify(ev)}\n\n`);
    }
    sseClients.add(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(
          `event: ping\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`
        );
      } catch {
        /* ignore */
      }
    }, 20000);
    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // Yangi snapshot yozilgach (masalan sync dvigateli tomonidan) chaqiriladi — barcha clientlarga push
  app.post("/api/refresh", (_req, res) => {
    broadcast("sync", { at: new Date().toISOString(), source: "manual" });
    res.json({ ok: true, pushed: sseClients.size });
  });

  if (mode === "server") {
    // Production: build qilingan client'ni serve qilish (serverless rejimda buni Vercel dist/public'dan to'g'ridan-to'g'ri qiladi)
    const staticPath =
      process.env.NODE_ENV === "production"
        ? path.resolve(__dirname, "public")
        : path.resolve(__dirname, "..", "dist", "public");

    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      const indexFile = path.join(staticPath, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        // Dev rejimi: client alohida vite serverda ishlayapti
        res
          .status(200)
          .type("text/plain")
          .send("API ishlayapti. Client: http://localhost:3000");
      }
    });
  }

  return app;
}
