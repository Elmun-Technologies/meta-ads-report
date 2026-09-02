/**
 * API server — dashboardning yagona ma'lumot manbasi.
 *
 * Arxitektura:
 *   snapshots/ papka  →  Connector (normalize)  →  /api/snapshot  →  UI
 *   Yangi snapshot tushsa → /api/stream (SSE) → barcha clientlar live yangilanadi.
 *
 * Yangi platforma (Google Ads, Yandex Direct MCP) ulash uchun CONNECTORS ga
 * yangi connector qo'shiladi — UI umumiy NormalizedSnapshot modeli ustida ishlaydi.
 */
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeMetaExport, type RawMetaExport } from "@shared/normalize";
import type { ConnectionInfo, NormalizedSnapshot, PlatformId } from "@shared/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = [path.join(__dirname, "data", "snapshots"), path.resolve(process.cwd(), "server", "data", "snapshots")].find((p) => fs.existsSync(p)) ?? path.resolve(process.cwd(), "server", "data", "snapshots");

const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);

/* ------------------------------------------------------------------ */
/* Connector layer                                                     */
/* ------------------------------------------------------------------ */

interface Connector {
  id: PlatformId;
  name: string;
  vendor: string;
  note?: string;
  /** Papkadagi eng yangiya snapshot fayli (meta uchun) */
  latestFile?: () => { file: string; mtime: Date } | null;
  resolve: (accountId?: string) => NormalizedSnapshot | null;
}

function latestMetaFile(): { file: string; mtime: Date } | null {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((file) => ({ file: path.join(DATA_DIR, file), mtime: fs.statSync(path.join(DATA_DIR, file)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files[0] ?? null;
}

function readMetaSnapshot(): NormalizedSnapshot | null {
  const latest = latestMetaFile();
  if (!latest) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(latest.file, "utf-8")) as RawMetaExport;
    return normalizeMetaExport(raw, {
      syncedAt: latest.mtime.toISOString(),
      sourceLabel: `Meta Ads MCP snapshot · ${path.basename(latest.file)}`,
    });
  } catch (err) {
    console.error("[meta] snapshot o'qishda xato:", err);
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
  },
  {
    id: "google-ads",
    name: "Google Ads",
    vendor: "Google",
    note: "Connector tayyor: Google Ads MCP ulangach, snapshot shu papkaga tushadi va dashboard avtomatik ko'radi.",
    resolve: () => null,
  },
  {
    id: "yandex-direct",
    name: "Yandex Direct",
    vendor: "Yandex",
    note: "Connector tayyor: Yandex Direct API/MCP ulangach, normalizer shared/ qatlamga qo'shiladi.",
    resolve: () => null,
  },
];

function connectionsPayload(): ConnectionInfo[] {
  return CONNECTORS.map((c) => {
    const snapshot = c.resolve();
    const latest = c.latestFile?.();
    return {
      id: c.id,
      name: c.name,
      vendor: c.vendor,
      status: snapshot ? "connected" : "ready",
      accounts: snapshot ? [{ id: snapshot.meta.account.id, name: snapshot.meta.account.name, currency: snapshot.meta.account.currency, externalId: snapshot.meta.account.externalId }] : [],
      syncedAt: latest?.mtime.toISOString() ?? null,
      note: c.note,
    } satisfies ConnectionInfo;
  });
}

/* ------------------------------------------------------------------ */
/* SSE — live sync kanali                                              */
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

function watchSnapshots() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  let debounce: NodeJS.Timeout | null = null;
  fs.watch(DATA_DIR, { persistent: false }, (eventType) => {
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

async function startServer() {
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
    res.json({ ok: true, at: new Date().toISOString(), snapshots: fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json")).length : 0 });
  });

  app.get("/api/connections", (_req, res) => {
    res.json(connectionsPayload());
  });

  app.get("/api/snapshot", (req, res) => {
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

  // Yangi snapshot yozilgach (masalan MCP tomonidan) chaqiladi — barcha clientlarga push
  app.post("/api/refresh", (_req, res) => {
    broadcast("sync", { at: new Date().toISOString(), source: "manual" });
    res.json({ ok: true, pushed: sseClients.size });
  });

  // Production: build qilingan client'ni serve qilish
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

  watchSnapshots();
  app.listen(PORT, () => {
    console.log(`[api] http://localhost:${PORT} · snapshots: ${DATA_DIR}`);
  });
}

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
