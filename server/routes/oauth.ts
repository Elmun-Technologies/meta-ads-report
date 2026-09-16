/**
 * OAuth ulanishlari — foydalanuvchi O'Z akkauntlarini ulaydi.
 *
 * Oqim (3 ta platforma, bir xil naqshda):
 *   1) GET /api/oauth/<platform>/start → tashqi consent sahifasiga redirect
 *   2) Foydalanuvchi ruxsat beradi → browser /api/oauth/<platform>/callback ga qaytadi
 *   3) Kod token'ga almashtiriladi, kabinetlar ro'yxati tortiladi, store'ga saqlanadi
 *   4) Sync dvigateli ulanishlardan muntazam tortadi
 *
 * CSRF: state parametri HMAC bilan imzolanadi.
 * Redirect URI: so'rov origin'idan avtomatik hosil qilinadi (preview + production ishlaydi).
 *
 * Kerakli app kalitlari (.env — bir marta, admin sozlaydi):
 *   Meta:    META_APP_ID + META_APP_SECRET (developers.facebook.com)
 *   Google:  GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET + GOOGLE_ADS_DEVELOPER_TOKEN
 *   AmoCRM:  AMOCRM_CLIENT_ID + AMOCRM_CLIENT_SECRET (amoCRM → Integratsiyalar)
 */
import { Router } from "express";
import crypto from "crypto";
import { loadMetaConfigFromEnv, pullMetaSnapshot } from "@shared/metaApi";
import { loadAmoAppCredentials } from "@shared/amoApi";
import type { OAuthAdAccount } from "@shared/types";
import { GoogleAdsClient, refreshAccessToken, GOOGLE_ADS_API_VERSION } from "@shared/googleAdsApi";
import {
  deleteConnection,
  listConnectionsPublic,
  setConnectionAccounts,
  setConnectionStatus,
  toggleAccount,
  upsertConnection,
} from "../connections";
import { logActivity } from "../store";
import { broadcast } from "../app";

export const oauthRouter = Router();

/* ------------------------------------------------------------------ */
/* Yordamchilar                                                        */
/* ------------------------------------------------------------------ */

function originOf(req: import("express").Request): string {
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "http");
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost");
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
<h1>✓ ${label} ulandi</h1><p>${platform} hisobi qo'shildi${accounts > 0 ? ` — ${accounts} kabinet topildi` : ""}.<br>Ulanishlar sahifasiga qaytilyapti…</p>
</div></body></html>`;
}

/* ------------------------------------------------------------------ */
/* Status — qaysi platformalar ulashga tayyor                          */
/* ------------------------------------------------------------------ */

export function oauthStatus() {
  return {
    meta:
      process.env.META_APP_ID && process.env.META_APP_SECRET
        ? { ready: true }
        : { ready: false, reason: "META_APP_ID va META_APP_SECRET .env da yo'q (developers.facebook.com da app yarating)" },
    "google-ads":
      process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET && process.env.GOOGLE_ADS_DEVELOPER_TOKEN
        ? { ready: true }
        : { ready: false, reason: "GOOGLE_ADS_CLIENT_ID / SECRET / DEVELOPER_TOKEN .env da yo'q" },
    amocrm: loadAmoAppCredentials()
      ? { ready: true }
      : { ready: false, reason: "AMOCRM_CLIENT_ID va AMOCRM_CLIENT_SECRET .env da yo'q (amoCRM → Sozlamalar → Integratsiyalar)" },
  } as Record<"meta" | "google-ads" | "amocrm", { ready: boolean; reason?: string }>;
}

oauthRouter.get("/status", (_req, res) => {
  res.json(oauthStatus());
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
/* Meta (Facebook Login)                                               */
/* ------------------------------------------------------------------ */

oauthRouter.get("/meta/start", (req, res) => {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    res.status(400).type("html").send(errorPage(req, "META_APP_ID sozlanmagan", ".env ga META_APP_ID va META_APP_SECRET qo'shing (developers.facebook.com da app yaratib oling)."));
    return;
  }
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri(req, "meta"));
  url.searchParams.set("state", makeState(req, "meta"));
  url.searchParams.set("scope", "ads_read,business_management");
  res.redirect(url.toString());
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
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  try {
    // Kod → short-lived token
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId!);
    tokenUrl.searchParams.set("client_secret", appSecret!);
    tokenUrl.searchParams.set("redirect_uri", redirectUri(req, "meta"));
    tokenUrl.searchParams.set("code", code);
    const tokenRes = await fetch(tokenUrl);
    const tokenJson = (await tokenRes.json()) as any;
    if (!tokenRes.ok || !tokenJson?.access_token) {
      throw new Error(tokenJson?.error?.message ?? "kod token'ga almashtirilmadi");
    }
    // Short-lived → long-lived (60 kun)
    const longUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId!);
    longUrl.searchParams.set("client_secret", appSecret!);
    longUrl.searchParams.set("fb_exchange_token", tokenJson.access_token);
    const longRes = await fetch(longUrl);
    const longJson = (await longRes.json()) as any;
    const accessToken = longJson?.access_token ?? tokenJson.access_token;
    const expiresAt = longJson?.expires_in
      ? new Date(Date.now() + Number(longJson.expires_in) * 1000).toISOString()
      : null;

    // Foydalanuvchi va kabinetlar ro'yxati
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=name&access_token=${encodeURIComponent(accessToken)}`
    );
    const me = (await meRes.json()) as any;
    const accRes = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?fields=name,account_id,currency&limit=200&access_token=${encodeURIComponent(accessToken)}`
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
      status: "active",
      accessToken,
      tokenExpiresAt: expiresAt,
      accounts,
      lastSyncAt: null,
    });
    setConnectionAccounts(conn.id, accounts);
    logActivity({
      kind: "channel",
      source: "oauth-meta",
      tone: "good",
      title: `Facebook ulandi: ${conn.label}`,
      body: accounts.length > 0 ? `${accounts.length} kabinet topildi` : "Kabinet topilmadi (ruxsatlarni tekshiring)",
    });
    broadcast("sync", { at: new Date().toISOString(), source: "oauth-meta" });
    res.type("html").send(successPage(req, "Facebook", conn.label, accounts.length));
  } catch (err) {
    res.status(500).type("html").send(errorPage(req, "Facebook ulanmadi", (err as Error).message));
  }
});

/* ------------------------------------------------------------------ */
/* Google Ads                                                          */
/* ------------------------------------------------------------------ */

oauthRouter.get("/google-ads/start", (req, res) => {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) {
    res.status(400).type("html").send(errorPage(req, "GOOGLE_ADS_CLIENT_ID sozlanmagan", ".env ga GOOGLE_ADS_CLIENT_ID / SECRET / DEVELOPER_TOKEN qo'shing (docs/google-ads-api-setup.md)."));
    return;
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri(req, "google-ads"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", makeState(req, "google-ads"));
  res.redirect(url.toString());
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
  try {
    // Kod → refresh + access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
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
    const accessToken = tokens.access_token;
    const accounts: OAuthAdAccount[] = [];
    try {
      const lcRes = await fetch(
        `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
          },
        }
      );
      const lc = (await lcRes.json()) as any;
      for (const rn of lc?.resourceNames ?? []) {
        const cid = String(rn).replace("customers/", "");
        if (cid)
          accounts.push({ id: cid, name: `Google Ads ${cid}`, currency: "USD", enabled: true, lastSyncAt: null });
      }
    } catch (err) {
      console.warn("[oauth:google] listAccessibleCustomers xato:", (err as Error).message);
    }

    const conn = upsertConnection({
      platform: "google-ads",
      label: "Google hisob",
      status: accounts.length > 0 ? "active" : "error",
      error: accounts.length > 0 ? undefined : "Kabinet topilmadi — developer token / ruxsatlarni tekshiring",
      accessToken,
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
    res.type("html").send(successPage(req, "Google Ads", conn.label, accounts.length));
  } catch (err) {
    res.status(500).type("html").send(errorPage(req, "Google Ads ulanmadi", (err as Error).message));
  }
});

/* ------------------------------------------------------------------ */
/* AmoCRM                                                              */
/* ------------------------------------------------------------------ */

oauthRouter.get("/amocrm/start", (req, res) => {
  const app = loadAmoAppCredentials();
  const subdomain = String(req.query.subdomain ?? "").trim().toLowerCase().replace(/\.amocrm\.ru$/, "");
  if (!app) {
    res.status(400).type("html").send(errorPage(req, "AMOCRM_CLIENT_ID sozlanmagan", "amoCRM → Sozlamalar → Integratsiyalar → yangi integratsiya yarating, client_id/secret ni .env ga qo'ying."));
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
  const app = loadAmoAppCredentials();
  try {
    const tokenRes = await fetch(`https://${sub}.amocrm.ru/oauth2/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: app!.clientId,
        client_secret: app!.clientSecret,
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
    res.type("html").send(successPage(req, "AmoCRM", conn.label, 0));
  } catch (err) {
    res.status(500).type("html").send(errorPage(req, "AmoCRM ulanmadi", (err as Error).message));
  }
});
