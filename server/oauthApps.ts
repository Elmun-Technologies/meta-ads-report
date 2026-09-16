/**
 * OAuth APP kalitlari xazinasi — .env ga qaramay, UI'dan kiritiladi.
 *
 * Muammo (avval): «Facebook bilan ulash» tugmasi faqat META_APP_ID/SECRET .env da
 * bo'lsa ishlardi; kalit yo'q bo'lsa tugma `disabled` turar, bosib bo'lmas edi.
 * Yechim: kalitlar endi IKKI joydan o'qiladi va birlashtiriladi:
 *
 *   1. .env  (deploy sozlamalari — Vercel/Railway secrets)
 *   2. store.json (UI'dan kiritilgan — serverni qayta ishga tushirish shart EMAS)
 *
 * Ustuvorlik: store'dagi qiymat yangiroq hisoblanadi (foydalanuvchi hozir kiritdi),
 * lekin bo'sh maydon .env dagi qiymatni o'chirmaydi. Maxfiy maydonlar client'ga
 * faqat niqoblangan (mask) ko'rinishda qaytadi.
 */
import { getStore, mutate } from "./store";
import { OAUTH_SETUP, type AppCreds, type OAuthPlatformId } from "@shared/oauthSetup";

export type { AppCreds, StoredApps } from "@shared/oauthSetup";

/* ------------------------------------------------------------------ */
/* O'qish / yozish                                                     */
/* ------------------------------------------------------------------ */

function stored(platform: OAuthPlatformId): AppCreds {
  return (getStore().oauthApps?.[platform] ?? {}) as AppCreds;
}

function envValue(envKey: string): string {
  const v = process.env[envKey];
  return typeof v === "string" ? v.trim() : "";
}

/** Birlashtirilgan kalitlar: .env + store (store bo'sh bo'lmagan maydonlarda g'olib) */
export function appCredentials(platform: OAuthPlatformId): AppCreds {
  const spec = OAUTH_SETUP[platform];
  const s = stored(platform);
  const out: AppCreds = {};
  for (const f of spec.appFields) {
    const fromStore = (s[f.key] ?? "").trim();
    const fromEnv = envValue(f.env);
    const value = fromStore || fromEnv;
    if (value) out[f.key] = value;
  }
  return out;
}

/** Kerakli (optional emas) maydonlar to'ldirilganmi */
export function appReady(platform: OAuthPlatformId): boolean {
  const creds = appCredentials(platform);
  return OAUTH_SETUP[platform].appFields
    .filter(f => !f.optional)
    .every(f => Boolean(creds[f.key]));
}

/** Yetishmayotgan maydonlar (label + env nomi) */
export function missingFields(platform: OAuthPlatformId): { key: string; label: string; env: string }[] {
  const creds = appCredentials(platform);
  return OAUTH_SETUP[platform].appFields
    .filter(f => !f.optional && !creds[f.key])
    .map(f => ({ key: f.key, label: f.label, env: f.env }));
}

/** Qiymat qayerdan kelgan: env / store / aralash / yo'q */
export function credsSource(platform: OAuthPlatformId): "env" | "store" | "mixed" | "none" {
  const s = stored(platform);
  let fromEnv = false;
  let fromStore = false;
  for (const f of OAUTH_SETUP[platform].appFields) {
    if ((s[f.key] ?? "").trim()) fromStore = true;
    else if (envValue(f.env)) fromEnv = true;
  }
  if (fromStore && fromEnv) return "mixed";
  if (fromStore) return "store";
  if (fromEnv) return "env";
  return "none";
}

/** Maxfiy qiymatni niqoblash — client'ga faqat shu ketadi */
export function maskSecret(value: string, secret = false): string {
  if (!value) return "";
  if (!secret) return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-4)}` : value;
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 3)}${"•".repeat(Math.min(10, value.length - 5))}${value.slice(-2)}`;
}

/** Saqlash: bo'sh yuborilgan maydon eskisini o'chirmaydi (partial update) */
export function saveAppCredentials(platform: OAuthPlatformId, patch: Record<string, unknown>): AppCreds {
  const spec = OAUTH_SETUP[platform];
  return mutate(store => {
    store.oauthApps = store.oauthApps ?? {};
    const cur = { ...(store.oauthApps[platform] ?? {}) } as AppCreds;
    for (const f of spec.appFields) {
      const raw = patch[f.key];
      if (typeof raw !== "string") continue;
      const value = raw.trim();
      if (!value) continue; // bo'sh = "o'zgartirmadim"
      // Niqoblangan qiymatni qayta yuborish — eskisini buzmaslik uchun e'tiborsiz
      if (f.secret && /^.{0,3}•+.{0,2}$/.test(value)) continue;
      cur[f.key] = value;
    }
    store.oauthApps[platform] = cur;
    return cur;
  });
}

/** Store'dagi kalitlarni o'chirish (.env dagi qiymatlar qoladi) */
export function clearAppCredentials(platform: OAuthPlatformId): boolean {
  return mutate(store => {
    const had = Boolean(store.oauthApps?.[platform] && Object.keys(store.oauthApps[platform]!).length);
    store.oauthApps = store.oauthApps ?? {};
    delete store.oauthApps[platform];
    return had;
  });
}

/* ------------------------------------------------------------------ */
/* Client'ga ko'rsatiladigan holat (maxfiy qiymatlarsiz)                */
/* ------------------------------------------------------------------ */

export interface AppPlatformStatus {
  ready: boolean;
  /** Nima yetishmayapti — aniq maydon nomlari */
  missing: { key: string; label: string; env: string }[];
  reason?: string;
  source: "env" | "store" | "mixed" | "none";
  /** Saqlangan qiymatlar (maxfiylari niqoblangan) — "nima kiritilgan" ko'rinishi uchun */
  values: Record<string, string>;
  /** OAuth dialogni boshlash mumkinmi */
  oauth: boolean;
  /** Token bilan ulash yo'li ochiqmi (app kalitlarisiz ham) */
  manual: boolean;
}

export function appPlatformStatus(platform: OAuthPlatformId): AppPlatformStatus {
  const spec = OAUTH_SETUP[platform];
  const creds = appCredentials(platform);
  const missing = missingFields(platform);
  const values: Record<string, string> = {};
  for (const f of spec.appFields) {
    if (creds[f.key]) values[f.key] = maskSecret(creds[f.key], f.secret);
  }
  const ready = missing.length === 0;
  return {
    ready,
    missing,
    source: credsSource(platform),
    values,
    oauth: ready,
    manual: Boolean(spec.manual),
    reason: ready
      ? undefined
      : `${spec.name} uchun app kalitlari kiritilmagan: ${missing.map(m => m.label).join(", ")}. Pastdagi «Sozlash» tugmasidan kiriting yoki «Token bilan ulash» dan foydalaning.`,
  };
}

export function appStatusAll(): Record<OAuthPlatformId, AppPlatformStatus> {
  return {
    meta: appPlatformStatus("meta"),
    "google-ads": appPlatformStatus("google-ads"),
    amocrm: appPlatformStatus("amocrm"),
  };
}

/* ------------------------------------------------------------------ */
/* Aniq platformalar uchun qulay getterlar (sync + OAuth route ishlatadi) */
/* ------------------------------------------------------------------ */

export function metaApp(): { appId: string; appSecret: string } | null {
  const c = appCredentials("meta");
  if (!c.appId || !c.appSecret) return null;
  return { appId: c.appId, appSecret: c.appSecret };
}

export function googleApp(): {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  managerId?: string;
} | null {
  const c = appCredentials("google-ads");
  if (!c.clientId || !c.clientSecret || !c.developerToken) return null;
  return {
    clientId: c.clientId,
    clientSecret: c.clientSecret,
    developerToken: c.developerToken,
    managerId: c.managerId || envValue("GOOGLE_ADS_MANAGER_ID") || undefined,
  };
}

/** Google'ning ixtiyoriy qismlari (manual ulanishda client id/secret yetishmasa ham) */
export function googleAppPartial(): {
  clientId?: string;
  clientSecret?: string;
  developerToken?: string;
  managerId?: string;
} {
  const c = appCredentials("google-ads");
  return {
    clientId: c.clientId,
    clientSecret: c.clientSecret,
    developerToken: c.developerToken,
    managerId: c.managerId || envValue("GOOGLE_ADS_MANAGER_ID") || undefined,
  };
}

export function amoApp(): { clientId: string; clientSecret: string } | null {
  const c = appCredentials("amocrm");
  if (!c.clientId || !c.clientSecret) return null;
  return { clientId: c.clientId, clientSecret: c.clientSecret };
}
