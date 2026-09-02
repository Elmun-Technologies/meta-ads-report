/**
 * Express ilova qurilmasi — bir xil route'lar ikki rejimda ishlaydi:
 *   - "server": uzoq muddatli process (Railway/Render/VPS) — fs.watch + SSE + statik client serve qiladi.
 *   - "serverless": Vercel funksiyasi (api/[[...slug]].ts) — faqat /api/* route'lar, statik fayllarni
 *     Vercel to'g'ridan-to'g'ri dist/public'dan beradi.
 *
 * Arxitektura:
 *   snapshots/ papka  →  Connector (normalize)  →  /api/snapshot  →  UI
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
import { matchLeadsToAds, normalizeAmoExport, type RawAmoExport } from "@shared/amo";
import type { ConnectionInfo, CrmData, NormalizedSnapshot, PlatformId, SnapshotInfo } from "@shared/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = [path.join(__dirname, "data", "snapshots"), path.resolve(process.cwd(), "server", "data", "snapshots")].find((p) => fs.existsSync(p)) ?? path.resolve(process.cwd(), "server", "data", "snapshots");

/* ------------------------------------------------------------------ */
/* Connector layer                                                     */
/* ------------------------------------------------------------------ */

interface Connector {
  id: PlatformId;
  name: string;
  vendor: string;
  note?: string;
  /** Papkadagi eng yangi snapshot fayli (meta uchun) */
  latestFile?: () => { file: string; mtime: Date } | null;
  resolve: (file?: string) => NormalizedSnapshot | null;
}

function platformForFile(file: string): PlatformId {
  if (file.startsWith("google")) return "google-ads";
  if (file.startsWith("yandex")) return "yandex-direct";
  return "meta";
}

function latestFileFor(prefix: "meta" | "google" | "yandex" | "amo"): { file: string; mtime: Date } | null {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .map((file) => ({ file: path.join(DATA_DIR, file), mtime: fs.statSync(path.join(DATA_DIR, file)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files[0] ?? null;
}

const latestMetaFile = () => latestFileFor("meta");

function readMetaSnapshot(file?: string): NormalizedSnapshot | null {
  const target = file ? path.join(DATA_DIR, path.basename(file)) : latestMetaFile()?.file;
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

/** Google Ads / Yandex Direct — universal alias normalizer orqali */
function readGenericSnapshot(platform: "google-ads" | "yandex-direct"): NormalizedSnapshot | null {
  const prefix = platform === "google-ads" ? "google" : "yandex";
  const latest = latestFileFor(prefix);
  if (!latest) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(latest.file, "utf-8"));
    return normalizeGenericAds(raw, { platform, syncedAt: latest.mtime.toISOString(), file: path.basename(latest.file) });
  } catch (err) {
    console.error(`[${platform}] snapshot o'qishda xato:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Barcha snapshot fayllari ro'yxati — davrlararo taqqoslash uchun */
function listSnapshots(): SnapshotInfo[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      try {
        const full = path.join(DATA_DIR, file);
        const raw = JSON.parse(fs.readFileSync(full, "utf-8")) as any;
        return {
          file,
          platform: platformForFile(file),
          accountName: raw.account?.name ?? raw.account_name ?? raw.Login ?? raw.name ?? "—",
          periodLabel: raw.account?.period ?? raw.period ?? raw.date_range ?? "—",
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
    .filter((f) => f.startsWith("amo") && f.endsWith(".json"))
    .map((file) => ({ file: path.join(DATA_DIR, file), mtime: fs.statSync(path.join(DATA_DIR, file)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files[0] ?? null;
}

function readAmoSnapshot(): CrmData | null {
  const latest = latestAmoFile();
  if (!latest) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(latest.file, "utf-8")) as RawAmoExport;
    const crm = normalizeAmoExport(raw, { syncedAt: latest.mtime.toISOString(), file: path.basename(latest.file) });
    return matchLeadsToAds(crm, readMetaSnapshot());
  } catch (err) {
    console.error("[amo] snapshot o'qishda xato:", err);
    return null;
  }
}

const CONNECTORS: Connector[] = [
  {
    id: "meta",
    name: "Meta Ads",
    vendor: "Facebook / Instagram",
    note: "Facebook Ads MCP orqali olingan real eksportga ulangan.",
    latestFile: latestMetaFile,
    resolve: () => readMetaSnapshot(),
  },  {
    id: "google-ads",
    name: "Google Ads",
    vendor: "Google",
    note: "google_*.json snapshot papkaga tushganda avtomatik ulanadi (campaign_name, cost_micros, clicks, conversions maydonlari taniladi — README).",
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

const CRM_CONNECTIONS: ConnectionInfo[] = [
  {
    id: "amocrm",
    name: "AmoCRM",
    vendor: "amoCRM — lead lifecycle",
    kind: "crm",
    status: "ready",
    accounts: [],
    syncedAt: null,
    note: "amo_*.json snapshot papkaga tushganda lead lifecycle (bosqichlar, bitimlar, ROAS) avtomatik yonadi.",
  },
];

function connectionsPayload(): ConnectionInfo[] {
  const crm = readAmoSnapshot();
  const amoInfo: ConnectionInfo = {
    ...CRM_CONNECTIONS[0],
    status: crm ? "connected" : "ready",
    accounts: crm ? [{ id: crm.account, name: crm.account, currency: crm.currency }] : [],
    syncedAt: crm?.syncedAt ?? null,
  };
  return [...CONNECTORS.map((c) => {
    const snapshot = c.resolve();
    const latest = c.latestFile?.();
    return {
      id: c.id,
      kind: "ads" as const,
      name: c.name,
      vendor: c.vendor,
      status: snapshot ? "connected" : "ready",
      accounts: snapshot ? [{ id: snapshot.meta.account.id, name: snapshot.meta.account.name, currency: snapshot.meta.account.currency, externalId: snapshot.meta.account.externalId }] : [],
      syncedAt: latest?.mtime.toISOString() ?? null,
      note: c.note,
    } satisfies ConnectionInfo;
  }), amoInfo];
}

/* ------------------------------------------------------------------ */
/* SSE — live sync kanali (faqat "server" rejimida ishlaydi)          */
/* ------------------------------------------------------------------ */

const sseClients = new Set<import("http").ServerResponse>();

function broadcast(event: string, data: unknown = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

/** Snapshot papkasini kuzatadi va SSE orqali ulangan clientlarga push qiladi. Faqat uzoq muddatli process'da chaqiriladi — serverless funksiya har chaqiriqda qayta ishga tushgani uchun fs.watch foydasiz. */
export function watchSnapshots() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  let debounce: NodeJS.Timeout | null = null;
  fs.watch(DATA_DIR, { persistent: false }, () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      const latest = latestMetaFile();
      broadcast("sync", { at: new Date().toISOString(), source: "snapshots-dir", file: latest ? path.basename(latest.file) : null });
    }, 400);
  });
}

/* ------------------------------------------------------------------ */
/* Express app                                                         */
/* ------------------------------------------------------------------ */

export type AppMode = "server" | "serverless";

export function createApp(mode: AppMode = "server") {
  const app = express();
  app.use(express.json({ limit: "20mb" }));

  // API CORS (dev proxy same-origin ishlatadi, lekin alohida deploymentda ham ishlashi uchun)
  app.use("/api", (_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode, at: new Date().toISOString(), snapshots: fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json")).length : 0 });
  });

  app.get("/api/connections", (_req, res) => {
    res.json(connectionsPayload());
  });

  app.get("/api/snapshots", (_req, res) => {
    // A/B taqqoslash faqat reklama davr snapshotlari uchun (amo_* — CRM, alohida)
    res.json(listSnapshots().filter((s) => !s.file.startsWith("amo")));
  });

  app.get("/api/crm", (_req, res) => {
    const crm = readAmoSnapshot();
    if (!crm) {
      res.status(503).json({ connected: false, error: "AmoCRM snapshot topilmadi — server/data/snapshots/ ga amo_*.json qo'ying (format: server/data/README.md)." });
      return;
    }
    res.json({ connected: true, ...crm });
  });

  app.get("/api/snapshot", (req, res) => {
    const file = req.query.file ? String(req.query.file) : undefined;
    if (file) {
      const snapshot = readMetaSnapshot(file);
      if (!snapshot) {
        res.status(404).json({ error: `Snapshot topilmadi: ${file}` });
        return;
      }
      res.json(snapshot);
      return;
    }
    const platform = String(req.query.platform || "meta") as PlatformId;
    const connector = CONNECTORS.find((c) => c.id === platform);
    if (!connector) {
      res.status(404).json({ error: `Unknown platform: ${platform}` });
      return;
    }
    const snapshot = connector.resolve(String(req.query.account || "") || undefined);
    if (!snapshot) {
      res.status(503).json({ error: `${connector.name} hali ulanmagan — snapshot topilmadi. server/data/snapshots/ ga eksport qo'ying.` });
      return;
    }
    res.json(snapshot);
  });

  app.get("/api/stream", (req, res) => {
    if (mode === "serverless") {
      // Serverless funksiyalar uzoq muddatli ulanishni ushlab turolmaydi — client polling'ga o'tadi.
      res.status(501).json({ error: "SSE serverless rejimida qo'llab-quvvatlanmaydi — client polling fallback ishlatadi." });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no")
    res.flushHeaders();
    res.write(`retry: 5000\n\n`);
    res.write(`event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString(), clients: sseClients.size + 1 })}\n\n`);
    sseClients.add(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(`event: ping\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
      } catch {
        /* ignore */
      }
    }, 20000);
    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // Yangi snapshot yozilgach (masalan MCP tomonidan) chaqiriladi — barcha clientlarga push
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
        res.status(200).type("text/plain").send("API ishlayapti. Client: http://localhost:3000");
      }
    });
  }

  return app;
}
