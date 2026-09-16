/**
 * OAuth orqali ulangan hisoblar xazinasi.
 *
 * Foydalanuvchi o'z Facebook / Google / AmoCRM akkauntlarini "Ulash" tugmasi
 * orqali qo'shadi — tokenlar SHU yerda (server/data/store.json) saqlanadi va
 * hech qachon client'ga yuborilmaydi. Sync dvigateli ulanishlardan tortadi.
 *
 * Bu loyihani "bir kompaniya uchun" emas — "mening barcha loyihalarim uchun
 * marketing markazi"ga aylantiradi: istalgan vaqt yangi kabinet ulanadi.
 */
import crypto from "crypto";
import { getStore, mutate } from "./store";
import type { OAuthAdAccount, OAuthConnection } from "@shared/types";

const PLATFORMS = ["meta", "google-ads", "amocrm"] as const;
type Platform = (typeof PLATFORMS)[number];

export function listConnections(): OAuthConnection[] {
  return getStore().oauth ?? [];
}

export function listConnectionsPublic() {
  return listConnections().map(c => ({
    id: c.id,
    platform: c.platform,
    label: c.label,
    status: c.status,
    error: c.error,
    createdAt: c.createdAt,
    lastSyncAt: c.lastSyncAt,
    tokenExpiresAt: c.tokenExpiresAt,
    accounts: c.accounts,
    subdomain: c.subdomain,
  }));
}

export function getConnection(id: string): OAuthConnection | null {
  return listConnections().find(c => c.id === id) ?? null;
}

export function upsertConnection(
  conn: Omit<OAuthConnection, "id" | "createdAt"> & { id?: string }
): OAuthConnection {
  return mutate(store => {
    store.oauth = store.oauth ?? [];
    const now = new Date().toISOString();
    const existing = conn.id ? store.oauth.find(c => c.id === conn.id) : undefined;
    if (existing) {
      Object.assign(existing, conn, { id: existing.id, createdAt: existing.createdAt });
      return existing;
    }
    const created: OAuthConnection = {
      id: conn.id ?? `conn-${crypto.randomUUID().slice(0, 8)}`,
      createdAt: now,
      ...conn,
    } as OAuthConnection;
    store.oauth.push(created);
    return created;
  });
}

export function deleteConnection(id: string): boolean {
  return mutate(store => {
    const before = (store.oauth ?? []).length;
    store.oauth = (store.oauth ?? []).filter(c => c.id !== id);
    return (store.oauth ?? []).length < before;
  });
}

/** Kabinet ro'yxatini yangilash (OAuth'dan keyin topilgan akkauntlar) */
export function setConnectionAccounts(
  id: string,
  accounts: { id: string; name: string; currency: string }[]
): void {
  mutate(store => {
    const conn = (store.oauth ?? []).find(c => c.id === id);
    if (!conn) return;
    const prev = new Map(conn.accounts.map(a => [a.id, a]));
    conn.accounts = accounts.map<OAuthAdAccount>(a => ({
      ...a,
      enabled: prev.get(a.id)?.enabled ?? true,
      lastSyncAt: prev.get(a.id)?.lastSyncAt ?? null,
    }));
  });
}

/** Bitta kabinetni yoqish/o'chirish (foydalanuvchi tanlagan) */
export function toggleAccount(connectionId: string, accountId: string): OAuthAdAccount | null {
  return mutate(store => {
    const conn = (store.oauth ?? []).find(c => c.id === connectionId);
    const acc = conn?.accounts.find(a => a.id === accountId);
    if (acc) acc.enabled = !acc.enabled;
    return acc ?? null;
  });
}

export function markSynced(connectionId: string, accountId?: string, at?: string): void {
  const ts = (at ?? new Date().toISOString());
  mutate(store => {
    const conn = (store.oauth ?? []).find(c => c.id === connectionId);
    if (!conn) return;
    conn.lastSyncAt = ts;
    if (accountId) {
      const acc = conn.accounts.find(a => a.id === accountId);
      if (acc) acc.lastSyncAt = ts;
    }
  });
}

export function setConnectionStatus(
  id: string,
  status: OAuthConnection["status"],
  error?: string
): void {
  mutate(store => {
    const conn = (store.oauth ?? []).find(c => c.id === id);
    if (!conn) return;
    conn.status = status;
    conn.error = error;
  });
}

/** Sync uchun ulanishlar (status "error" bo'lsa ham uriniladi — tuzilishi mumkin) */
export function activeConnections(platform?: Platform): OAuthConnection[] {
  return listConnections().filter(c => !platform || c.platform === platform);
}
