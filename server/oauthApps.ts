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
import {
  ALL_SETUP,
  OAUTH_SETUP,
  type AppCreds,
  type OAuthPlatformId,
  type SetupId,
} from "@shared/oauthSetup";

export type { AppCreds, StoredApps } from "@shared/oauthSetup";

/* ------------------------------------------------------------------ */
/* O'qish / yozish                                                     */
/* ------------------------------------------------------------------ */

function stored(id: SetupId): AppCreds {
  return (getStore().oauthApps?.[id] ?? {}) as AppCreds;
}

function envValue(envKey: string): string {
  const v = process.env[envKey];
  return typeof v === "string" ? v.trim() : "";
}

/** Birlashtirilgan kalitlar: .env + store (store bo'sh bo'lmagan maydonlarda g'olib) */
export function appCredentials(id: SetupId): AppCreds {
  const spec = ALL_SETUP[id];
  const s = stored(id);
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
export function appReady(id: SetupId): boolean {
  const creds = appCredentials(id);
  return ALL_SETUP[id].appFields.filter(f => !f.optional).every(f => Boolean(creds[f.key]));
}

/** Yetishmayotgan maydonlar (label + env nomi) */
export function missingFields(id: SetupId): { key: string; label: string; env: string }[] {
  const creds = appCredentials(id);
  return ALL_SETUP[id].appFields
    .filter(f => !f.optional && !creds[f.key])
    .map(f => ({ key: f.key, label: f.label, env: f.env }));
}

/** Qiymat qayerdan kelgan: env / store / aralash / yo'q */
export function credsSource(id: SetupId): "env" | "store" | "mixed" | "none" {
  const s = stored(id);
  let fromEnv = false;
  let fromStore = false;
  for (const f of ALL_SETUP[id].appFields) {
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
export function saveAppCredentials(id: SetupId, patch: Record<string, unknown>): AppCreds {
  const spec = ALL_SETUP[id];
  return mutate(store => {
    store.oauthApps = store.oauthApps ?? {};
    const cur = { ...(store.oauthApps[id] ?? {}) } as AppCreds;
    for (const f of spec.appFields) {
      const raw = patch[f.key];
      if (typeof raw !== "string") continue;
      const value = raw.trim();
      if (!value) continue; // bo'sh = "o'zgartirmadim"
      // Niqoblangan qiymatni qayta yuborish — eskisini buzmaslik uchun e'tiborsiz
      if (f.secret && /^.{0,3}•+.{0,2}$/.test(value)) continue;
      cur[f.key] = value;
    }
    store.oauthApps[id] = cur;
    return cur;
  });
}

/** Store'dagi kalitlarni o'chirish (.env dagi qiymatlar qoladi) */
export function clearAppCredentials(id: SetupId): boolean {
  return mutate(store => {
    const had = Boolean(store.oauthApps?.[id] && Object.keys(store.oauthApps[id]!).length);
    store.oauthApps = store.oauthApps ?? {};
    delete store.oauthApps[id];
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

export function appPlatformStatus(id: SetupId): AppPlatformStatus {
  const spec = ALL_SETUP[id];
  const creds = appCredentials(id);
  const missing = missingFields(id);
  const values: Record<string, string> = {};
  for (const f of spec.appFields) {
    if (creds[f.key]) values[f.key] = maskSecret(creds[f.key], f.secret);
  }
  const ready = missing.length === 0;
  const isService = spec.kind === "service";
  return {
    ready,
    missing,
    source: credsSource(id),
    values,
    // Servislar (Telegram) uchun OAuth dialog yo'q — "oauth" flag false qoladi
    oauth: ready && !isService,
    manual: Boolean(spec.manual),
    reason: ready
      ? undefined
      : isService
        ? `${spec.name} uchun API kaliti kiritilmagan: ${missing.map(m => m.label).join(", ")}. Quyidagi maydonga token qo'ying va «Saqlash» ni bosing.`
        : `${spec.name} uchun app kalitlari kiritilmagan: ${missing.map(m => m.label).join(", ")}. «Sozlash» tugmasidan kiriting yoki «Token bilan ulash» dan foydalaning.`,
  };
}

/** Faqat OAuth platformalar (UI'dagi «… bilan ulash» tugmalari) */
export function appStatusAll(): Record<OAuthPlatformId, AppPlatformStatus> {
  return {
    meta: appPlatformStatus("meta"),
    "google-ads": appPlatformStatus("google-ads"),
    amocrm: appPlatformStatus("amocrm"),
  };
}

/** Barcha manbalar (OAuth + Telegram servisi) — /api/oauth/apps javobi */
export function setupStatusAll(): Record<SetupId, AppPlatformStatus> {
  return {
    ...appStatusAll(),
    telegram: appPlatformStatus("telegram"),
  };
}

/** TGStat tokeni — .env yoki UI'dan kiritilgan (sync + telegram route ishlatadi) */
export function tgstatToken(): string | null {
  return appCredentials("telegram").token || null;
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
