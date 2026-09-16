/**
 * AmoCRM API client — real-time pull (OAuth orqali ulangan hisob uchun).
 *
 * Tokenlar server/connections.ts da saqlanadi (foydalanuvchi "Ulash" deganda).
 * Bu modul shu tokenlar bilan AmoCRM v4 API'dan:
 *   - pipeline va bosqichlarni
 *   - leadlarni (UTM + kontakt telefonlari bilan)
 * tortadi va RawAmoExport shaklida qaytaradi — normalizeAmoExport qayta ishlatiladi.
 *
 * Token 24 soat, refresh_token 90 kun — har pull'da avtomatik yangilanadi.
 */
import type { RawAmoExport } from "./amo";

export interface AmoTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string; // ISO
  subdomain: string;
}

export interface AmoAppCredentials {
  clientId: string;
  clientSecret: string;
}

export function loadAmoAppCredentials(env = process.env): AmoAppCredentials | null {
  const clientId = env.AMOCRM_CLIENT_ID;
  const clientSecret = env.AMOCRM_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function amoConfigured(env = process.env): boolean {
  return loadAmoAppCredentials(env) != null;
}

function apiBase(subdomain: string): string {
  return `https://${subdomain}.amocrm.ru`;
}

/* ------------------------------------------------------------------ */
/* Token yangilash                                                     */
/* ------------------------------------------------------------------ */

export async function refreshAmoToken(
  app: AmoAppCredentials,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const res = await fetch(`${apiBase("www") /* token endpoint har qaysi subdomainda ishlaydi */}/oauth2/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !json?.access_token) {
    throw new Error(
      `AmoCRM token yangilanmadi (${res.status}): ${json?.detail ?? json?.error_description ?? ""}`.trim()
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresIn: Number(json.expires_in ?? 86400),
  };
}

/** Token eskirgan bo'lsa yangilaydi (o'zgartirilgan tokenlarni qaytaradi) */
export async function ensureFreshToken(
  app: AmoAppCredentials,
  tokens: AmoTokens
): Promise<AmoTokens> {
  if (new Date(tokens.tokenExpiresAt).getTime() > Date.now() + 60_000) return tokens;
  const t = await refreshAmoToken(app, tokens.refreshToken);
  return {
    ...tokens,
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    tokenExpiresAt: new Date(Date.now() + t.expiresIn * 1000).toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* API so'rovlari                                                      */
/* ------------------------------------------------------------------ */

async function amoGet<T>(tokens: AmoTokens, path: string): Promise<T> {
  const res = await fetch(`${apiBase(tokens.subdomain)}${path}`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AmoCRM API ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Barcha sahifalab ro'yxat tortadi */
async function amoGetAll<T>(tokens: AmoTokens, path: string, key: string): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await amoGet<any>(tokens, `${path}${sep}limit=250&page=${page}`);
    const items = data?._embedded?.[key] ?? [];
    out.push(...items);
    if (items.length < 250 || page > 40) break;
    page++;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Leadlar → RawAmoExport                                              */
/* ------------------------------------------------------------------ */

interface AmoCustomField {
  field_id?: number;
  field_name?: string;
  field_code?: string;
  values: { value: string | number }[];
}

function fieldValue(fields: AmoCustomField[] | undefined, match: (f: AmoCustomField) => boolean): string | null {
  for (const f of fields ?? []) {
    if (match(f)) {
      const v = f.values?.[0]?.value;
      if (v != null && String(v) !== "") return String(v);
    }
  }
  return null;
}

const byName = (needle: string) => (f: AmoCustomField) =>
  `${f.field_name ?? ""} ${f.field_code ?? ""}`.toLowerCase().includes(needle);

export async function pullAmoSnapshot(tokens: AmoTokens): Promise<RawAmoExport> {
  /* Pipeline + bosqichlar */
  const pipelinesData = await amoGet<any>(tokens, "/api/v4/leads/pipelines");
  const pipelines = (pipelinesData?._embedded?.pipelines ?? []) as any[];
  const stages: any[] = [];
  for (const p of pipelines) {
    for (const st of p.statuses ?? []) {
      stages.push({
        id: st.id,
        name: st.name,
        pipeline_id: p.id,
        sort: st.sort ?? st.order ?? 0,
        // v4: type 0 = oddiy, 1 = won, 2 = lost
        status: st.type === 1 ? { kind: "won" } : st.type === 2 ? { kind: "lost" } : undefined,
      });
    }
  }

  /* Leadlar (kontaktlar bilan) */
  const leads = await amoGetAll<any>(tokens, "/api/v4/leads?with=contacts", "leads");

  /* Kontaktlar — telefonlar uchun (bo'sh bo'lsa ham davom etamiz) */
  const contactIds = [
    ...new Set(
      leads.flatMap(l => (l._embedded?.contacts ?? []).map((c: any) => String(c.id)))
    ),
  ].slice(0, 2000);
  const contactsById = new Map<string, any>();
  for (let i = 0; i < contactIds.length; i += 250) {
    try {
      const chunk = await amoGet<any>(
        tokens,
        `/api/v4/contacts?id=${contactIds.slice(i, i + 250).join(",")}`
      );
      for (const c of chunk?._embedded?.contacts ?? []) contactsById.set(String(c.id), c);
    } catch {
      /* kontakt olinmasa — lead baribir ko'rinadi */
    }
  }

  const mapped = leads.map(l => {
    const contact = contactsById.get(String(l._embedded?.contacts?.[0]?.id ?? ""));
    const cf = (l.custom_fields_values ?? []) as AmoCustomField[];
    const ccf = (contact?.custom_fields_values ?? []) as AmoCustomField[];
    const phone =
      fieldValue(ccf, f => (f.field_code ?? "").toUpperCase() === "PHONE") ??
      fieldValue(ccf, byName("телефон")) ??
      fieldValue(ccf, byName("phone"));
    return {
      id: l.id,
      name: l.name ?? `Lead #${l.id}`,
      created_at: l.created_at ? new Date(Number(l.created_at) * 1000).toISOString() : "",
      updated_at: l.updated_at ? new Date(Number(l.updated_at) * 1000).toISOString() : "",
      stage_id: l.status_id,
      pipeline_id: l.pipeline_id,
      price: Number(l.price ?? 0),
      responsible: l.responsible_user_id ? `user_${l.responsible_user_id}` : null,
      // normalizeAmoExport: contact.name va contact.phone o'qiydi
      contact: contact?.name || phone ? { name: contact?.name ?? null, phone } : null,
      utm: {
        utm_campaign: fieldValue(cf, byName("utm_campaign")) ?? null,
        utm_content: fieldValue(cf, byName("utm_content")) ?? null,
        utm_source: fieldValue(cf, byName("utm_source")) ?? null,
      },
      utm_campaign: fieldValue(cf, byName("utm_campaign")),
      utm_content: fieldValue(cf, byName("utm_content")),
      utm_source: fieldValue(cf, byName("utm_source")),
      history: [],
      loss_reason: fieldValue(cf, byName("причин")) ?? fieldValue(cf, byName("loss")),
    };
  });

  return {
    account: {
      name: `${tokens.subdomain}.amocrm.ru`,
      subdomain: tokens.subdomain,
      currency: process.env.AMOCRM_CURRENCY || "UZS",
    },
    pipelines: pipelines.map(p => ({ id: p.id, name: p.name })),
    stages,
    leads: mapped,
  };
}
