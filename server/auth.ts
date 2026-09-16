/**
 * Oddiy va mustahkam parol himoyasi (auth).
 *
 * Nima uchun: dashboard ochiq URL'da turadi (Vercel/preview/VPS) — ma'lumotni
 * ko'rish uchun parol talab qilinadi. Rollar/foydalanuvchilar bazasi yo'q —
 * bitta parol (DASHBOARD_PASSWORD), sessiya HMAC imzolangan cookie'da.
 *
 * Env:
 *   DASHBOARD_PASSWORD — yoqilganda butun /api/* parol ostiga o'tadi
 *   AUTH_SECRET        — (ixtiyoriy) sessiya imzosi uchun maxfiy kalit;
 *                        berilmasa paroldan hosil qilinadi (parol o'zgarsa
 *                        sessiyalar ham tugaydi — bu xavfsiz tomoni)
 *   WEBHOOK_SECRET     — (ixtiyoriy) AmoCRM webhook URL'iga ?secret=... talabi
 *
 * Ochiq qoladigan yo'llar: /api/auth/*, /api/health, /api/webhooks/*
 * (server-to-server webhook cookie yubora olmaydi — ularga WEBHOOK_SECRET).
 */
import crypto from "crypto";

const COOKIE_NAME = "ads_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 kun

export function authEnabled(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

function secret(): string {
  return process.env.AUTH_SECRET || `ads-center:${process.env.DASHBOARD_PASSWORD}`;
}

function sign(exp: string): string {
  return crypto.createHmac("sha256", secret()).update(exp).digest("hex");
}

/** Sessiya tokeni: `<tugash vaqti ms>.<hmac>` */
export function createSessionToken(): string {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac) return false;
  const expected = sign(exp);
  const a = Buffer.from(mac, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(exp) > Date.now();
}

/** Cookie'ni request'dan ajratib olish */
export function sessionFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE_NAME) return v.join("=");
  }
  return null;
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? "; Secure" : ""}`;
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function passwordMatches(input: unknown): boolean {
  const pass = process.env.DASHBOARD_PASSWORD ?? "";
  const str = typeof input === "string" ? input : "";
  if (!pass) return false;
  const a = Buffer.from(str, "utf-8");
  const b = Buffer.from(pass, "utf-8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function webhookSecretOk(query: Record<string, unknown>): boolean {
  const required = process.env.WEBHOOK_SECRET;
  if (!required) return true; // maxfiy kalit qo'yilmagan — webhook ochiq
  const provided = String(query.secret ?? "");
  const a = Buffer.from(provided, "utf-8");
  const b = Buffer.from(required, "utf-8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
