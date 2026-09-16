/**
 * Platformalarni ulash — OAuth dialog VA "token bilan ulash".
 *
 * Oqim (OAuth — 3 ta platforma, bir xil naqshda):
 *   1) GET /api/oauth/<platform>/start → tashqi consent sahifasiga redirect
 *   2) Foydalanuvchi ruxsat beradi → browser /api/oauth/<platform>/callback ga qaytadi
 *   3) Kod token'ga almashtiriladi, kabinetlar ro'yxati tortiladi, store'ga saqlanadi
 *   4) Sync dvigateli ulanishlardan muntazam tortadi (ulanishdan keyin DARHOL ham)
 *
 * Muqobil oqim (token bilan — app yaratish shart emas):
 *   POST /api/oauth/<platform>/token → kalit tekshiriladi → ulanish saqlanadi → sync
 *
 * App kalitlari endi IKKI joydan o'qiladi (server/oauthApps.ts):
 *   .env (deploy secrets) + store.json (UI'dan kiritilgan — restart shart emas).
 *
 * CSRF: state parametri HMAC bilan imzolanadi.
 * Redirect URI: so'rov origin'idan avtomatik hosil qilinadi (preview + production ishlaydi).
 */
import { Router } from "express";
import crypto from "crypto";
import type { OAuthAdAccount, OAuthConnection } from "@shared/types";
import {
  ALL_SETUP,
  OAUTH_SETUP,
  isSetupId,
  type OAuthPlatformId,
  type SetupId,
} from "@shared/oauthSetup";
import { refreshAccessToken, GOOGLE_ADS_API_VERSION } from "@shared/googleAdsApi";
import {
  deleteConnection,
  listConnectionsPublic,
  setConnectionAccounts,
  setConnectionStatus,
  toggleAccount,
  upsertConnection,
} from "../connections";
import {
  amoApp,
  appCredentials,
  appPlatformStatus,
  appStatusAll,
  clearAppCredentials,
  googleApp,
  googleAppPartial,
  metaApp,
  saveAppCredentials,
  setupStatusAll,
} from "../oauthApps";
import { logActivity } from "../store";
import { broadcast } from "../app";
import { syncPlatformNow } from "../sync";

export const oauthRouter = Router();

const META_API_VERSION = () => process.env.META_API_VERSION || "v21.0";

/* ------------------------------------------------------------------ */
/* Yordamchilar                                                        */
/* ------------------------------------------------------------------ */

/**
 * Tashqi (browser ko'radigan) manzil — redirect URI shundan hosil qilinadi.
 * Ustuvorlik: PUBLIC_ORIGIN (deploy'da aniq yoziladi) → X-Forwarded-* → Host.
 * Preview/proxy ortida ham provider'ga to'g'ri URL ketishi uchun.
 */
function originOf(req: import("express").Request): string {
  const publicOrigin = (process.env.PUBLIC_ORIGIN ?? "").trim().replace(/\/$/, "");
  if (publicOrigin) return publicOrigin;
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "http").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost").split(",")[0].trim();
  return `${proto}://${host}`;
}

function redirectUri(req: import("express").Request, platform: string): string {
  return `${originOf(req)}/api/oauth/${platform}/callback`;
}

/** CSRF state: `<ts>[.<extra>].<hmac>` — 10 daqiqa amal qiladi, extra (masalan subdomain) imzolanadi */
function makeState(req: import("express").Request, platform: string, extra = ""): string {
  const ts = String(Date.now());
  const mac = crypto
    .createHmac("sha256", process.env.AUTH_SECRET ?? "ads-center-oauth")
    .update(`${platform}:${ts}:${extra}`)
    .digest("hex");
  return extra ? `${ts}.${extra}.${mac}` : `${ts}.${mac}`;
}

function checkState(
  req: import("express").Request,
  platform: string,
  state: string | undefined
): { ok: boolean; extra?: string } {
  if (!state) return { ok: false };
  const parts = state.split(".");
  const ts = parts[0];
  const mac = parts[parts.length - 1];
  const extra = parts.length > 2 ? parts.slice(1, -1).join(".") : "";
  if (!ts || !mac) return { ok: false };
  if (Date.now() - Number(ts) > 10 * 60 * 1000) return { ok: false };
  const expected = crypto
    .createHmac("sha256", process.env.AUTH_SECRET ?? "ads-center-oauth")
    .update(`${platform}:${ts}:${extra}`)
    .digest("hex");
  const a = Buffer.from(mac, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  return { ok: a.length === b.length && crypto.timingSafeEqual(a, b), extra };
}

/** OAuth xatolari uchun chiroyli HTML sahifa (browser'da ko'rinadi) */
function errorPage(req: import("express").Request, message: string, details?: string) {
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Ulanish xatosi</title>
<style>body{font-family:system-ui,sans-serif;background:#0e1116;color:#e6e9ef;display:grid;place-items:center;min-height:100vh;margin:0}
.panel{max-width:460px;padding:28px;background:#161a22;border:1px solid #262c38;border-radius:14px}
h1{font-size:16px;margin:0 0 8px}p{font-size:13px;color:#9aa3b2;line-height:1.6;margin:0 0 6px}
code{background:#0e1116;padding:2px 6px;border-radius:6px;font-size:11.5px;color:#c9d3e3;word-break:break-all}
a{color:#5e8bff}</style></head><body><div class="panel">
<h1>⚠ Ulanishda xato</h1><p>${message}</p>${details ? `<p><code>${details}</code></p>` : ""}
<p><a href="${originOf(req)}/connections">← Ulanishlar sahifasiga qaytish</a></p>
</div></body></html>`;
}

function successPage(req: import("express").Request, platform: string, label: string, accounts: number) {
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Ulandi</title>
<meta http-equiv="refresh" content="2;url=${originOf(req)}/connections">
<style>body{font-family:system-ui,sans-serif;background:#0e1116;color:#e6e9ef;display:grid;place-items:center;min-height:100vh;margin:0}
.panel{max-width:460px;padding:28px;background:#161a22;border:1px solid #262c38;border-radius:14px;text-align:center}
h1{font-size:16px;margin:0 0 8px}p{font-size:13px;color:#9aa3b2;line-height:1.6}</style></head><body><div class="panel">
<h1>✓ ${label} ulandi</h1><p>${platform} hisobi qo'shildi${accounts > 0 ? ` — ${accounts} kabinet topildi` : ""}.<br>Ma'lumot hozir tortilmoqda, Ulanishlar sahifasiga qaytilyapti…</p>
</div></body></html>`;
}

/**
 * Ulanishdan keyin DARHOL sync — foydalanuvchi 5 daqiqa kutmasligi uchun.
 * Javob qaytgach ishga tushadi (fire-and-forget), xato bo'lsa log'ga yoziladi.
 */
function syncSoon(platform: OAuthPlatformId | "telegram") {
  setTimeout(() => {
    void syncPlatformNow(platform).catch(err => {
      console.warn(`[oauth] ${platform} sync xatosi:`, err instanceof Error ? err.message : err);
    });
  }, 250);
}

/**
 * Tarmoq xatosini odam tiliga o'girish.
 * Serverdan tashqi API'ga chiqish bloklangan bo'lsa (firewall/proxy/DNS) fetch
 * "fetch failed" deb qaytadi — foydalanuvchi bundan hech narsa tushunmaydi.
 */
function netError(err: unknown, host: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = (err as { cause?: { code?: string; message?: string } } | null)?.cause;
  const code = cause?.code ?? "";
  if (/fetch failed|socket hang up|network/i.test(msg) || /^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|CERT_|UNABLE_TO_)/.test(code)) {
    return `Server ${host} ga ulanmadi (${code || msg}). Bu serverdan tashqi API'ga chiqishga ruxsat bormi — internet/proxy/firewall sozlamalarini tekshiring.`;
  }
  return msg;
}

function str(body: unknown, key: string): string {
  const v = (body as Record<string, unknown> | undefined)?.[key];
  return typeof v === "string" ? v.trim() : "";
}

function isPlatform(id: string): id is OAuthPlatformId {
  return id === "meta" || id === "google-ads" || id === "amocrm";
}

/* ------------------------------------------------------------------ */
/* TGStat (Telegram) — token tekshiruvi                                */
/* ------------------------------------------------------------------ */

const TGSTAT_BASE = "https://api.tgstat.ru";

/**
 * Token haqiqiymi? — `GET /usage/stat` bilan tekshiriladi.
 * Bu metod TGStat'da barcha tariflarda mavjud va TARIFLANMAYDI (kvotani yemaydi),
 * shuning uchun tekshiruv uchun ideal. Javob: { status: "ok", response: [...] }.
 *
 * "unverified" — TGStat'ga umuman ulanib bo'lmadi (tarmoq/firewall): token
 * SAQLANADI, lekin foydalanuvchiga "tekshirib bo'lmadi" deyiladi (bloklamaymiz).
 */
async function probeTgstat(token: string): Promise<{ state: "ok" | "invalid" | "unverified"; message: string }> {
  try {
    const res = await fetch(`${TGSTAT_BASE}/usage/stat?token=${encodeURIComponent(token)}`);
    const json = (await res.json().catch(() => ({}))) as any;
    const errText = String(json?.error ?? json?.message ?? "");
    if (res.status === 404) {
      return { state: "unverified", message: "TGStat tekshiruv metodini topmadi — token saqlandi" };
    }
    if (!res.ok || (json?.status && json.status !== "ok")) {
      const msg = errText || `TGStat ${res.status}`;
      const invalid = res.status === 401 || res.status === 403 || /token|токен|auth|invalid/i.test(msg);
      return { state: invalid ? "invalid" : "unverified", message: msg };
    }
    const tariffs = Array.isArray(json?.response) ? json.response : [];
    if (tariffs.length === 0) {
      return {
        state: "ok",
        message: "Token to'g'ri, lekin faol tarif ko'rinmadi — TGStat kabinetida API ulanishini tekshiring",
      };
    }
    const t = tariffs[0] as { title?: string; expiredAt?: number; spentRequests?: string };
    return {
      state: "ok",
      message: `Token ishlayapti${t?.title ? ` — ${t.title}` : ""}${
        t?.expiredAt ? ` (muddati: ${new Date(Number(t.expiredAt) * 1000).toISOString().slice(0, 10)})` : ""
      }${t?.spentRequests ? ` · so'rovlar: ${t.spentRequests}` : ""}`,
    };
  } catch (err) {
    return { state: "unverified", message: netError(err, "api.tgstat.ru") };
  }
}

/* ------------------------------------------------------------------ */
/* Status — qaysi platformalar ulashga tayyor                          */
/* ------------------------------------------------------------------ */

/** Har platforma uchun: ready / yetishmayotgan maydonlar / qiymatlar qayerdan */
export function oauthStatus() {
  return appStatusAll();
}

oauthRouter.get("/status", (_req, res) => {
  res.json(oauthStatus());
});

/** Barcha manbalar holati (Telegram servisi ham) — UI'dagi «Sozlash» oynasi uchun */
oauthRouter.get("/setup", (_req, res) => {
  res.json({ platforms: setupStatusAll(), setup: ALL_SETUP });
});

/** Ulangan hisoblar ro'yxati (tokensiz!) */
oauthRouter.get("/accounts", (_req, res) => {
  res.json({ connections: listConnectionsPublic() });
});

/** Kabinetni yoqish/o'chirish */
oauthRouter.post("/accounts/:connectionId/:accountId/toggle", (req, res) => {
  const acc = toggleAccount(req.params.connectionId, req.params.accountId);
  if (!acc) {
    res.status(404).json({ error: "Kabinet topilmadi" });
    return;
  }
  broadcast("sync", { at: new Date().toISOString(), source: "account-toggled" });
  res.json({ account: acc });
});

/** Ulanishni o'chirish */
oauthRouter.delete("/connections/:id", (req, res) => {
  const ok = deleteConnection(req.params.id);
  broadcast("sync", { at: new Date().toISOString(), source: "connection-removed" });
  res.json({ ok });
});

/* ------------------------------------------------------------------ */
/* APP kalitlari — UI'dan kiritiladi (restart shart emas)              */
/* ------------------------------------------------------------------ */

/** Kalitlar holati: nima bor (niqoblangan), nima yetishmayapti, qayerdan */
oauthRouter.get("/apps", (_req, res) => {
  res.json({
    // Barcha manbalar (meta / google-ads / amocrm / telegram) holati
    platforms: setupStatusAll(),
    setup: ALL_SETUP,
  });
});

/** Host bilan birga — provider sozlamasiga yoziladigan aniq redirect URI'lar */
oauthRouter.get("/apps/redirect-uris", (req, res) => {
  const origin = originOf(req);
  const uris: Record<string, string> = {};
  for (const id of Object.keys(OAUTH_SETUP) as OAuthPlatformId[]) {
    if (OAUTH_SETUP[id].callbackPath) uris[id] = `${origin}${OAUTH_SETUP[id].callbackPath}`;
  }
  res.json({ origin, uris });
});

/**
 * App/servis kalitlarini saqlash (partial — bo'sh maydon eskisini o'chirmaydi).
 * Telegram uchun token darhol TGStat'da tekshiriladi (saqlash baribir bajariladi).
 */
oauthRouter.post("/apps/:platform", async (req, res) => {
  const id = req.params.platform;
  if (!isSetupId(id)) {
    res.status(404).json({ error: `Noma'lum manba: ${id}` });
    return;
  }
  const saved = saveAppCredentials(id, (req.body ?? {}) as Record<string, unknown>);
  if (Object.keys(saved).length === 0 && appPlatformStatus(id).source === "none") {
    res.status(400).json({
      error: "Hech qanday kalit qabul qilinmadi — maydonlarni to'ldiring",
      status: appPlatformStatus(id),
    });
    return;
  }
  const status = appPlatformStatus(id);

  // Telegram: token tekshiruvi (saqlashga to'sqinlik qilmaydi)
  let probe: { state: string; message: string } | undefined;
  if (id === "telegram") {
    const token = appCredentials("telegram").token;
    if (token) probe = await probeTgstat(token);
  }

  logActivity({
    kind: "channel",
    source: `oauth-apps-${id}`,
    tone: probe?.state === "invalid" ? "warn" : status.ready ? "good" : "warn",
    title: `${ALL_SETUP[id].name} — kalitlar saqlandi`,
    body: probe
      ? probe.message
      : status.ready
        ? "Kalitlar to'liq — ulash tugmasi ishlaydi"
        : `Hali yetishmayapti: ${status.missing.map(m => m.label).join(", ")}`,
  });
  broadcast("sync", { at: new Date().toISOString(), source: "app-credentials" });
  // Telegram tokeni saqlangach kanallarni darhol tortishga urinamiz
  if (id === "telegram" && status.ready) syncSoon("telegram");
  res.json({ ok: true, ready: status.ready, status, probe });
});

/** Store'dagi kalitlarni o'chirish (.env qiymatlari qoladi) */
oauthRouter.delete("/apps/:platform", (req, res) => {
  const id = req.params.platform;
  if (!isSetupId(id)) {
    res.status(404).json({ error: `Noma'lum manba: ${id}` });
    return;
  }
  const removed = clearAppCredentials(id);
  logActivity({
    kind: "channel",
    source: `oauth-apps-${id}`,
    tone: "warn",
    title: `${ALL_SETUP[id].name} — saqlangan kalitlar o'chirildi`,
  });
  res.json({ ok: removed, status: appPlatformStatus(id) });
});

/* ------------------------------------------------------------------ */
/* Meta (Facebook Login)                                               */
/* ------------------------------------------------------------------ */

oauthRouter.get("/meta/start", (req, res) => {
  const app = metaApp();
  if (!app) {
    const st = appPlatformStatus("meta");
    res.status(400).type("html").send(
      errorPage(
        req,
        "Meta app kalitlari sozlanmagan",
        `${st.reason ?? ""}\n\nKerakli maydonlar: ${st.missing.map(m => `${m.label} (${m.env})`).join(", ")}`
      )
    );
    return;
  }
  const url = new URL(`https://www.facebook.com/${META_API_VERSION()}/dialog/oauth`);
  url.searchParams.set("client_id", app.appId);
  url.searchParams.set("redirect_uri", redirectUri(req, "meta"));
  url.searchParams.set("state", makeState(req, "meta"));
  url.searchParams.set("scope", "ads_read,business_management");
  res.redirect(url.toString());
});

/** Meta — access token bilan ulash (app yaratmasdan) */
oauthRouter.post("/meta/token", async (req, res) => {
  const accessToken = str(req.body, "accessToken");
  const wanted = str(req.body, "adAccountId").replace(/^act_/, "");
  if (!accessToken) {
    res.status(400).json({ error: "Access token bo'sh — Meta'dan olingan tokenni qo'ying" });
    return;
  }
  const v = META_API_VERSION();
  try {
    // 1) Token haqiqiymi? (ism olish — eng yengil so'rov)
    const meRes = await fetch(`https://graph.facebook.com/${v}/me?fields=name&access_token=${encodeURIComponent(accessToken)}`);
    const me = (await meRes.json().catch(() => ({}))) as any;
    if (!meRes.ok || me?.error) {
      throw new Error(me?.error?.message ?? `Meta token yaroqsiz (${meRes.status})`);
    }

    // 2) Kabinetlar ro'yxati
    const accRes = await fetch(
      `https://graph.facebook.com/${v}/me/adaccounts?fields=name,account_id,currency,account_status&limit=200&access_token=${encodeURIComponent(accessToken)}`
    );
    const accJson = (await accRes.json().catch(() => ({}))) as any;
    if (!accRes.ok && accJson?.error) {
      throw new Error(`Kabinetlar olinmadi: ${accJson.error.message} (tokenda ads_read huquqi bormi?)`);
    }
    const list = (accJson?.data ?? []) as any[];
    let accounts: OAuthAdAccount[] = list
      .filter(a => a.account_id)
      .map(a => ({
        id: String(a.account_id),
        name: a.name ?? `act_${a.account_id}`,
        currency: a.currency ?? "USD",
        enabled: true,
        lastSyncAt: null,
      }));
    if (wanted) {
      const found = accounts.find(a => a.id === wanted);
      accounts = found ? [found] : [{ id: wanted, name: `act_${wanted}`, currency: "USD", enabled: true, lastSyncAt: null }];
    }
    if (accounts.length === 0) {
      throw new Error("Bu token bilan hech qanday reklama kabineti topilmadi (ads_read huquqi yoki kabinet ruxsati yo'q)");
    }

    const conn = upsertConnection({
      platform: "meta",
      label: me?.name ? `Facebook — ${me.name}` : "Facebook (token)",
      status: "active",
      method: "token",
      accessToken,
      tokenExpiresAt: null,
      accounts,
      lastSyncAt: null,
    });
    setConnectionAccounts(conn.id, accounts);
    logActivity({
      kind: "channel",
      source: "oauth-meta-token",
      tone: "good",
      title: `Facebook ulandi: ${conn.label}`,
      body: `${accounts.length} kabinet topildi — ma'lumot hozir tortiladi`,
    });
    broadcast("sync", { at: new Date().toISOString(), source: "oauth-meta-token" });
    syncSoon("meta");
    res.json({ ok: true, connection: conn.id, label: conn.label, accounts });
  } catch (err) {
    const message = netError(err, "graph.facebook.com");
    logActivity({ kind: "error", source: "oauth-meta-token", tone: "risk", title: "Facebook ulanmadi", body: message });
    res.status(400).json({ error: message });
  }
});

oauthRouter.get("/meta/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;
  if (error) {
    res.type("html").send(errorPage(req, "Facebook ruxsat bermadi", `${error}: ${error_description ?? ""}`));
    return;
  }
  if (!checkState(req, "meta", state).ok || !code) {
    res.status(400).type("html").send(errorPage(req, "Noto'g'ri holat (state) — qaytadan urinib ko'ring"));
    return;
  }
  const app = metaApp();
  if (!app) {
    res.status(400).type("html").send(errorPage(req, "META_APP_ID / META_APP_SECRET sozlanmagan", appPlatformStatus("meta").reason));
    return;
  }
  const v = META_API_VERSION();
  try {
    // Kod → short-lived token
    const tokenUrl = new URL(`https://graph.facebook.com/${v}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", app.appId);
    tokenUrl.searchParams.set("client_secret", app.appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri(req, "meta"));
    tokenUrl.searchParams.set("code", code);
    const tokenRes = await fetch(tokenUrl);
    const tokenJson = (await tokenRes.json()) as any;
    if (!tokenRes.ok || !tokenJson?.access_token) {
      throw new Error(tokenJson?.error?.message ?? "kod token'ga almashtirilmadi");
    }
    // Short-lived → long-lived (60 kun)
    const longUrl = new URL(`https://graph.facebook.com/${v}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", app.appId);
    longUrl.searchParams.set("client_secret", app.appSecret);
    longUrl.searchParams.set("fb_exchange_token", tokenJson.access_token);
    const longRes = await fetch(longUrl);
    const longJson = (await longRes.json()) as any;
    const accessToken = longJson?.access_token ?? tokenJson.access_token;
    const expiresAt = longJson?.expires_in
      ? new Date(Date.now() + Number(longJson.expires_in) * 1000).toISOString()
      : null;

    // Foydalanuvchi va kabinetlar ro'yxati
    const meRes = await fetch(
      `https://graph.facebook.com/${v}/me?fields=name&access_token=${encodeURIComponent(accessToken)}`
    );
    const me = (await meRes.json()) as any;
    const accRes = await fetch(
      `https://graph.facebook.com/${v}/me/adaccounts?fields=name,account_id,currency&limit=200&access_token=${encodeURIComponent(accessToken)}`
    );
    const accJson = (await accRes.json()) as any;
    const adAccounts = (accJson?.data ?? []) as any[];
    const accounts: OAuthAdAccount[] = adAccounts
      .filter(a => a.account_id)
      .map(a => ({
        id: String(a.account_id),
        name: a.name ?? `act_${a.account_id}`,
        currency: a.currency ?? "USD",
        enabled: true,
        lastSyncAt: null,
      }));

    const conn = upsertConnection({
      platform: "meta",
      label: me?.name ? `Facebook — ${me.name}` : "Facebook hisob",
      status: accounts.length > 0 ? "active" : "error",
      error: accounts.length > 0 ? undefined : "Kabinet topilmadi — token huquqlarini tekshiring",
      method: "oauth",
      accessToken,
      tokenExpiresAt: expiresAt,
      accounts,
      lastSyncAt: null,
    });
    setConnectionAccounts(conn.id, accounts);
    logActivity({
      kind: "channel",
      source: "oauth-meta",
      tone: accounts.length > 0 ? "good" : "warn",
      title: `Facebook ulandi: ${conn.label}`,
      body: accounts.length > 0 ? `${accounts.length} kabinet topildi` : "Kabinet topilmadi (ruxsatlarni tekshiring)",
    });
    broadcast("sync", { at: new Date().toISOString(), source: "oauth-meta" });
    syncSoon("meta");
    res.type("html").send(successPage(req, "Facebook", conn.label, accounts.length));
  } catch (err) {
    res.status(500).type("html").send(errorPage(req, "Facebook ulanmadi", netError(err, "graph.facebook.com")));
  }
});

/* ------------------------------------------------------------------ */
/* Google Ads                                                          */
/* ------------------------------------------------------------------ */

oauthRouter.get("/google-ads/start", (req, res) => {
  const app = googleApp();
  if (!app) {
    const st = appPlatformStatus("google-ads");
    res.status(400).type("html").send(
      errorPage(
        req,
        "Google Ads app kalitlari sozlanmagan",
        `${st.reason ?? ""}\n\nKerakli maydonlar: ${st.missing.map(m => `${m.label} (${m.env})`).join(", ")}`
      )
    );
    return;
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", redirectUri(req, "google-ads"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", makeState(req, "google-ads"));
  res.redirect(url.toString());
});

/** Google'ga tegishli kabinetlarni topish (access token bilan) */
async function googleAccessibleAccounts(accessToken: string, developerToken: string): Promise<OAuthAdAccount[]> {
  const lcRes = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
    { headers: { Authorization: `Bearer ${accessToken}`, "developer-token": developerToken } }
  );
  const lc = (await lcRes.json().catch(() => ({}))) as any;
  if (!lcRes.ok) {
    throw new Error(lc?.error?.message ?? `listAccessibleCustomers → ${lcRes.status}`);
  }
  return (lc?.resourceNames ?? [])
    .map((rn: string) => String(rn).replace("customers/", ""))
    .filter(Boolean)
    .map((cid: string) => ({
      id: cid,
      name: `Google Ads ${cid}`,
      currency: "USD",
      enabled: true,
      lastSyncAt: null,
    }));
}

/** Google Ads — refresh token bilan ulash */
oauthRouter.post("/google-ads/token", async (req, res) => {
  const refreshToken = str(req.body, "refreshToken");
  const developerToken = str(req.body, "developerToken");
  const clientId = str(req.body, "clientId");
  const clientSecret = str(req.body, "clientSecret");
  const managerId = str(req.body, "managerId");
  const customerIds = str(req.body, "customerIds")
    .split(/[\s,;]+/)
    .map(s => s.replace(/\D/g, ""))
    .filter(Boolean);

  const saved = googleAppPartial();
  const eff = {
    clientId: clientId || saved.clientId || "",
    clientSecret: clientSecret || saved.clientSecret || "",
    developerToken: developerToken || saved.developerToken || "",
    managerId: managerId || saved.managerId || undefined,
  };
  if (!refreshToken) {
    res.status(400).json({ error: "Refresh token bo'sh — pnpm google:oauth yoki OAuth Playground orqali oling" });
    return;
  }
  if (!eff.clientId || !eff.clientSecret) {
    res.status(400).json({
      error: "OAuth Client ID va Client Secret kerak — «App kalitlari» bo'limida saqlang yoki shu formada qo'shing",
    });
    return;
  }
  try {
    const accessToken = await refreshAccessToken({
      clientId: eff.clientId,
      clientSecret: eff.clientSecret,
      refreshToken,
    });
    let accounts: OAuthAdAccount[] = customerIds.map(cid => ({
      id: cid,
      name: `Google Ads ${cid}`,
      currency: "USD",
      enabled: true,
      lastSyncAt: null,
    }));
    let accountsWarning: string | undefined;
    if (accounts.length === 0) {
      if (!eff.developerToken) {
        accountsWarning =
          "Developer token yo'q — kabinetlar ro'yxatini olib bo'lmadi. Customer ID'ni qo'lda kiriting yoki developer tokenni saqlang.";
      } else {
        accounts = await googleAccessibleAccounts(accessToken, eff.developerToken);
      }
    }
    if (accounts.length === 0 && !accountsWarning) {
      accountsWarning = "Kabinet topilmadi — hisobda Google Ads kabineti bormi?";
    }

    // Forma orqali berilgan app kalitlarini saqlab qo'yamiz — sync ham ishlatadi
    saveAppCredentials("google-ads", {
      clientId: eff.clientId,
      clientSecret: eff.clientSecret,
      ...(eff.developerToken ? { developerToken: eff.developerToken } : {}),
      ...(eff.managerId ? { managerId: eff.managerId } : {}),
    });

    const conn = upsertConnection({
      platform: "google-ads",
      label: "Google hisob",
      status: accounts.length > 0 ? "active" : "error",
      error: accountsWarning,
      method: "token",
      accessToken,
      refreshToken,
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      accounts,
      lastSyncAt: null,
    });
    setConnectionAccounts(conn.id, accounts);
    logActivity({
      kind: "channel",
      source: "oauth-google-token",
      tone: accounts.length > 0 ? "good" : "warn",
      title: "Google Ads ulandi (refresh token)",
      body: accounts.length > 0 ? `${accounts.length} kabinet topildi` : accountsWarning,
    });
    broadcast("sync", { at: new Date().toISOString(), source: "oauth-google-token" });
    if (accounts.length > 0) syncSoon("google-ads");
    res.json({ ok: true, connection: conn.id, label: conn.label, accounts, warning: accountsWarning });
  } catch (err) {
    const message = netError(err, "oauth2.googleapis.com");
    logActivity({ kind: "error", source: "oauth-google-token", tone: "risk", title: "Google Ads ulanmadi", body: message });
    res.status(400).json({ error: message });
  }
});

oauthRouter.get("/google-ads/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) {
    res.type("html").send(errorPage(req, "Google ruxsat bermadi", error));
    return;
  }
  if (!checkState(req, "google-ads", state).ok || !code) {
    res.status(400).type("html").send(errorPage(req, "Noto'g'ri holat (state) — qaytadan urinib ko'ring"));
    return;
  }
  const app = googleApp();
  if (!app) {
    res.status(400).type("html").send(errorPage(req, "Google app kalitlari sozlanmagan", appPlatformStatus("google-ads").reason));
    return;
  }
  try {
    // Kod → refresh + access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri(req, "google-ads"),
      }),
    });
    const tokens = (await tokenRes.json()) as any;
    if (!tokenRes.ok || !tokens?.refresh_token) {
      throw new Error(tokens?.error_description ?? "refresh_token olinmadi (prompt=consent kerak)");
    }

    // Mavjud customerlar ro'yxati
    let accounts: OAuthAdAccount[] = [];
    let accountsError: string | undefined;
    try {
      accounts = await googleAccessibleAccounts(tokens.access_token, app.developerToken);
    } catch (err) {
      accountsError = err instanceof Error ? err.message : String(err);
      console.warn("[oauth:google] listAccessibleCustomers xato:", accountsError);
    }

    const conn = upsertConnection({
      platform: "google-ads",
      label: "Google hisob",
      status: accounts.length > 0 ? "active" : "error",
      error: accounts.length > 0 ? undefined : (accountsError ?? "Kabinet topilmadi — developer token / ruxsatlarni tekshiring"),
      method: "oauth",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
      accounts,
      lastSyncAt: null,
    });
    setConnectionAccounts(conn.id, accounts);
    logActivity({
      kind: "channel",
      source: "oauth-google",
      tone: accounts.length > 0 ? "good" : "warn",
      title: "Google Ads ulandi",
      body: accounts.length > 0 ? `${accounts.length} kabinet topildi` : "Kabinet topilmadi",
    });
    broadcast("sync", { at: new Date().toISOString(), source: "oauth-google" });
    if (accounts.length > 0) syncSoon("google-ads");
    res.type("html").send(successPage(req, "Google Ads", conn.label, accounts.length));
  } catch (err) {
    res.status(500).type("html").send(errorPage(req, "Google Ads ulanmadi", netError(err, "oauth2.googleapis.com")));
  }
});

/* ------------------------------------------------------------------ */
/* AmoCRM                                                              */
/* ------------------------------------------------------------------ */

oauthRouter.get("/amocrm/start", (req, res) => {
  const app = amoApp();
  const subdomain = str(req.query, "subdomain").toLowerCase().replace(/\.amocrm\.ru$/, "");
  if (!app) {
    const st = appPlatformStatus("amocrm");
    res.status(400).type("html").send(
      errorPage(
        req,
        "AmoCRM app kalitlari sozlanmagan",
        `${st.reason ?? ""}\n\nKerakli maydonlar: ${st.missing.map(m => `${m.label} (${m.env})`).join(", ")}`
      )
    );
    return;
  }
  if (!subdomain) {
    res.status(400).type("html").send(errorPage(req, "subdomain ko'rsatilmagan", "Ulanishlar sahifasida AmoCRM subdomeningizni kiriting (masalan: sofexpo)."));
    return;
  }
  const url = new URL(`https://${subdomain}.amocrm.ru/oauth2/authorize`);
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", redirectUri(req, "amocrm"));
  url.searchParams.set("response_type", "code");
  // Subdomain state ichida imzolanib yuboriladi — callback'da uni o'qi olamiz
  url.searchParams.set("state", makeState(req, "amocrm", subdomain));
  res.redirect(url.toString());
});

/** AmoCRM — tayyor API kaliti (uzun muddatli token) bilan ulash */
oauthRouter.post("/amocrm/token", async (req, res) => {
  const subdomain = str(req.body, "subdomain").toLowerCase().replace(/\.amocrm\.ru$/, "").replace(/^https?:\/\//, "");
  const accessToken = str(req.body, "accessToken");
  const refreshToken = str(req.body, "refreshToken");
  if (!subdomain) {
    res.status(400).json({ error: "Subdomain bo'sh (masalan: sofexpo)" });
    return;
  }
  if (!accessToken) {
    res.status(400).json({ error: "Access token bo'sh — AmoCRM → Integratsiyalar → API kalitlari" });
    return;
  }
  try {
    // Token tekshiruvi — hisob ma'lumoti
    const accRes = await fetch(`https://${subdomain}.amocrm.ru/api/v4/account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const accJson = (await accRes.json().catch(() => ({}))) as any;
    if (!accRes.ok) {
      throw new Error(
        accJson?.detail || accJson?.title || `AmoCRM ${accRes.status} — subdomain yoki tokenni tekshiring`
      );
    }
    const conn = upsertConnection({
      platform: "amocrm",
      label: `${subdomain}.amocrm.ru`,
      subdomain,
      status: "active",
      method: "token",
      accessToken,
      refreshToken: refreshToken || undefined,
      // Refresh token bo'lmasa muddat belgilanmaydi — kalit uzoq muddatli
      tokenExpiresAt: refreshToken ? new Date(Date.now() + 24 * 3600 * 1000).toISOString() : null,
      accounts: [],
      lastSyncAt: null,
    });
    logActivity({
      kind: "channel",
      source: "oauth-amocrm-token",
      tone: "good",
      title: `AmoCRM ulandi: ${conn.label}`,
      body: "Leadlar hozir API'dan tortiladi",
    });
    broadcast("sync", { at: new Date().toISOString(), source: "oauth-amocrm-token" });
    syncSoon("amocrm");
    res.json({ ok: true, connection: conn.id, label: conn.label, account: accJson?.name ?? subdomain });
  } catch (err) {
    const message = netError(err, `${subdomain}.amocrm.ru`);
    logActivity({ kind: "error", source: "oauth-amocrm-token", tone: "risk", title: "AmoCRM ulanmadi", body: message });
    res.status(400).json({ error: message });
  }
});

oauthRouter.get("/amocrm/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) {
    res.type("html").send(errorPage(req, "amoCRM ruxsat bermadi", error));
    return;
  }
  const st = checkState(req, "amocrm", state);
  const sub = st.extra; // start'da imzolangan subdomain
  if (!code || !st.ok || !sub) {
    res.status(400).type("html").send(errorPage(req, "Noto'g'ri holat (state) — qaytadan urinib ko'ring"));
    return;
  }
  const app = amoApp();
  if (!app) {
    res.status(400).type("html").send(errorPage(req, "AmoCRM app kalitlari sozlanmagan", appPlatformStatus("amocrm").reason));
    return;
  }
  try {
    const tokenRes = await fetch(`https://${sub}.amocrm.ru/oauth2/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(req, "amocrm"),
      }),
    });
    const tokens = (await tokenRes.json()) as any;
    if (!tokenRes.ok || !tokens?.access_token) {
      throw new Error(tokens?.detail ?? "token olinmadi");
    }

    const conn = upsertConnection({
      platform: "amocrm",
      label: `${sub}.amocrm.ru`,
      subdomain: sub,
      status: "active",
      method: "oauth",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in ?? 86400) * 1000).toISOString(),
      accounts: [],
      lastSyncAt: null,
    });
    logActivity({
      kind: "channel",
      source: "oauth-amocrm",
      tone: "good",
      title: `AmoCRM ulandi: ${conn.label}`,
      body: "Leadlar endi har sync'da API'dan tortiladi",
    });
    broadcast("sync", { at: new Date().toISOString(), source: "oauth-amocrm" });
    syncSoon("amocrm");
    res.type("html").send(successPage(req, "AmoCRM", conn.label, 0));
  } catch (err) {
    res.status(500).type("html").send(errorPage(req, "AmoCRM ulanmadi", netError(err, `${sub}.amocrm.ru`)));
  }
});

/* ------------------------------------------------------------------ */
/* Mavjud ulanishni darhol yangilash (bitta platforma)                  */
/* ------------------------------------------------------------------ */

oauthRouter.post("/sync/:platform", async (req, res) => {
  const id = req.params.platform;
  if (!isPlatform(id) && id !== "telegram") {
    res.status(404).json({ error: `Noma'lum platforma: ${id}` });
    return;
  }
  try {
    const result = await syncPlatformNow(id);
    res.json({ ok: result?.ok ?? false, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** Ulanish holatini tuzatish (masalan token yangilangach) */
oauthRouter.post("/connections/:id/status", (req, res) => {
  const status = str(req.body, "status");
  if (!["active", "expired", "error"].includes(status)) {
    res.status(400).json({ error: "status: active | expired | error" });
    return;
  }
  setConnectionStatus(
    req.params.id,
    status as OAuthConnection["status"],
    str(req.body, "error") || undefined
  );
  res.json({ ok: true });
});
