/**
 * Meta Ads Graph API client — real-time pull rejimi.
 *
 * META_ACCESS_TOKEN + META_AD_ACCOUNT_ID berilganda sync dvigateli har INTERVALda
 * shu modul orqali to'g'ridan-to'g'ri Graph API'dan kampaniya/kreativ/auditoriya
 * ma'lumotini tortadi va papkaga meta_*.json snapshot yozadi — MCP eksportini
 * qo'lda tashlash shart emas.
 *
 * Natija formati normalizeMetaExport bilan 100% mos (RawMetaExport) — UI
 * hech qanday o'zgarishsiz ishlaydi.
 *
 * Env:
 *   META_ACCESS_TOKEN   — long-lived User/Page token yoki System User token
 *   META_AD_ACCOUNT_ID  — act_... yoki faqat raqamlar
 *   META_DAYS           — qancha kunlik davr (default 30)
 *   META_API_VERSION    — default v21.0
 */
import type { RawMetaExport } from "./normalize";

export interface MetaApiConfig {
  accessToken: string;
  adAccountId: string; // act_ prefiksisiz
  days: number;
  apiVersion: string;
}

export function loadMetaConfigFromEnv(env = process.env): MetaApiConfig | null {
  const accessToken = env.META_ACCESS_TOKEN;
  const rawAccount = env.META_AD_ACCOUNT_ID;
  if (!accessToken || !rawAccount) return null;
  const adAccountId = String(rawAccount).replace(/^act_/, "").trim();
  const days = Number(env.META_DAYS || 30);
  return {
    accessToken,
    adAccountId,
    days: Number.isFinite(days) && days >= 1 ? Math.min(Math.floor(days), 365) : 30,
    apiVersion: env.META_API_VERSION || "v21.0",
  };
}

export function metaConfigured(env = process.env): boolean {
  return Boolean(env.META_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID);
}

/* ------------------------------------------------------------------ */
/* Graph API so'rovlari                                                */
/* ------------------------------------------------------------------ */

interface GraphList<T> {
  data: T[];
  paging?: { next?: string | null };
}

async function graphGet<T>(
  cfg: MetaApiConfig,
  path: string,
  params: Record<string, string>
): Promise<T> {
  const qs = new URLSearchParams(params);
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${path}?${qs.toString()}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const msg = json?.error?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`Meta Graph API xato: ${msg}`);
  }
  return json as T;
}

/** Paging bilan to'liq ro'yxat tortiladi */
async function graphGetAll<T>(
  cfg: MetaApiConfig,
  path: string,
  params: Record<string, string>
): Promise<T[]> {
  const out: T[] = [];
  let page = await graphGet<GraphList<T>>(cfg, path, params);
  out.push(...(page.data ?? []));
  let guard = 0;
  while (page.paging?.next && guard++ < 20) {
    const res = await fetch(page.paging.next, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    });
    if (!res.ok) break;
    page = (await res.json()) as GraphList<T>;
    out.push(...(page.data ?? []));
  }
  return out;
}

type RawRow = Record<string, any>;

const INSIGHT_FIELDS = [
  "spend",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "inline_link_clicks",
  "inline_link_click_ctr",
  "actions",
].join(",");

function dateRange(cfg: MetaApiConfig): { since: string; until: string; label: string } {
  const until = new Date();
  const since = new Date(until.getTime() - (cfg.days - 1) * 24 * 3600 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { since: iso(since), until: iso(until), label: `${iso(since)} — ${iso(until)}` };
}

/* ------------------------------------------------------------------ */
/* Asosiy pull                                                         */
/* ------------------------------------------------------------------ */

export interface MetaPullResult {
  doc: RawMetaExport;
  /** Snapshots papkasiga yozish uchun tavsiya etilgan fayl nomi */
  fileName: string;
  account: { id: string; name: string; currency: string };
}

export async function pullMetaSnapshot(cfg: MetaApiConfig): Promise<MetaPullResult> {
  const act = `act_${cfg.adAccountId}`;
  const range = dateRange(cfg);
  const timeRange = JSON.stringify({ since: range.since, until: range.until });

  // 1) Kabinet ma'lumoti
  const account = await graphGet<{ name: string; currency: string; account_id: string }>(cfg, act, {
    fields: "name,currency,account_id",
  });

  // 2) Kampaniya darajasidagi insights
  const campaignInsights = await graphGetAll<RawRow>(cfg, `${act}/insights`, {
    level: "campaign",
    fields: `campaign_id,campaign_name,objective,${INSIGHT_FIELDS}`,
    time_range: timeRange,
    limit: "500",
  });
  if (!campaignInsights.length) {
    throw new Error(
      `Davr uchun kampaniya ma'lumoti bo'sh (${range.label}) — token/huquqlarni tekshiring`
    );
  }

  // 3) Reklama (ad) darajasidagi insights
  let adInsights: RawRow[] = [];
  try {
    adInsights = await graphGetAll<RawRow>(cfg, `${act}/insights`, {
      level: "ad",
      fields: `ad_id,ad_name,campaign_id,adset_id,adset_name,${INSIGHT_FIELDS}`,
      time_range: timeRange,
      limit: "500",
    });
  } catch (err) {
    console.warn("[meta-api] ad insights olinmadi:", (err as Error).message);
  }

  // 4) Ad meta (status, created_time)
  let ads: RawRow[] = [];
  try {
    ads = await graphGetAll<RawRow>(cfg, `${act}/ads`, {
      fields: "id,name,status,effective_status,created_time",
      limit: "500",
    });
  } catch (err) {
    console.warn("[meta-api] ads ro'yxati olinmadi:", (err as Error).message);
  }

  // 5) Yosh bo'yicha kesim (kampaniya darajasida)
  let age: RawRow[] = [];
  try {
    age = await graphGetAll<RawRow>(cfg, `${act}/insights`, {
      level: "campaign",
      breakdowns: "age",
      fields: `age,${INSIGHT_FIELDS}`,
      time_range: timeRange,
      limit: "1000",
    });
    // Yosh qatorlarini kampaniyalar bo'yicha jamlaymiz (umumiy kesim uchun)
    const byAge = new Map<string, RawRow>();
    for (const row of age) {
      const key = String(row.age ?? "unknown");
      const acc = byAge.get(key) ?? { age: key, actions: [], spend: 0, impressions: 0, clicks: 0, reach: 0, frequency: 0 };
      acc.spend += Number(row.spend ?? 0);
      acc.impressions += Number(row.impressions ?? 0);
      acc.clicks += Number(row.clicks ?? 0);
      acc.reach += Number(row.reach ?? 0);
      for (const a of row.actions ?? []) {
        const cur = (acc.actions as any[]).find(x => x.action_type === a.action_type);
        if (cur) cur.value = String(Number(cur.value) + Number(a.value ?? 0));
        else (acc.actions as any[]).push({ ...a });
      }
      byAge.set(key, acc);
    }
    const totalImpressions = [...byAge.values()].reduce((s, r) => s + r.impressions, 0);
    const totalClicks = [...byAge.values()].reduce((s, r) => s + r.clicks, 0);
    const totalSpend = [...byAge.values()].reduce((s, r) => s + r.spend, 0);
    for (const row of byAge.values()) {
      row.ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      row.cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
      row.frequency = row.reach > 0 ? row.impressions / row.reach : 0;
    }
    age = [...byAge.values()].sort((a, b) => String(a.age).localeCompare(String(b.age)));
  } catch (err) {
    console.warn("[meta-api] age kesimi olinmadi:", (err as Error).message);
    age = [];
  }

  // 6) Kunlik timeseries (time_increment=1) — trend chart uchun
  let daily: RawRow[] = [];
  try {
    const dailyRows = await graphGetAll<RawRow>(cfg, `${act}/insights`, {
      level: "campaign",
      time_increment: "1",
      fields: `date_start,${INSIGHT_FIELDS}`,
      time_range: timeRange,
      limit: "1000",
    });
    // Kampaniyalar bo'yicha kunlarga jamlaymiz
    const byDate = new Map<string, RawRow>();
    for (const row of dailyRows) {
      const key = String(row.date_start ?? "");
      if (!key) continue;
      const acc = byDate.get(key) ?? { date_start: key, spend: 0, impressions: 0, clicks: 0, actions: [] };
      acc.spend += Number(row.spend ?? 0);
      acc.impressions += Number(row.impressions ?? 0);
      acc.clicks += Number(row.clicks ?? 0);
      for (const a of row.actions ?? []) {
        const cur = (acc.actions as any[]).find(x => x.action_type === a.action_type);
        if (cur) cur.value = String(Number(cur.value) + Number(a.value ?? 0));
        else (acc.actions as any[]).push({ ...a });
      }
      byDate.set(key, acc);
    }
    daily = [...byDate.values()].sort((a, b) =>
      String(a.date_start).localeCompare(String(b.date_start))
    );
  } catch (err) {
    console.warn("[meta-api] kunlik timeseries olinmadi:", (err as Error).message);
    daily = [];
  }

  // 7) Summary — kampaniya insights dan jamlanadi
  const actionSum = (rows: RawRow[], type: string): number =>
    rows.reduce(
      (s, r) => s + Number((r.actions ?? []).find((a: RawRow) => a.action_type === type)?.value ?? 0),
      0
    );
  const sum = (rows: RawRow[], field: string): number =>
    rows.reduce((s, r) => s + Number(r[field] ?? 0), 0);
  const leads = actionSum(campaignInsights, "lead") ||
    actionSum(campaignInsights, "onsite_conversion.lead_grouped");
  const impressions = sum(campaignInsights, "impressions");
  const clicks = sum(campaignInsights, "clicks");
  const spend = sum(campaignInsights, "spend");
  const reach = sum(campaignInsights, "reach");
  const summary: Record<string, number> = {
    spend,
    impressions,
    reach,
    frequency_weighted: reach > 0 ? impressions / reach : 0,
    clicks_all: clicks,
    link_clicks: sum(campaignInsights, "inline_link_clicks"),
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    link_click_ctr:
      sum(campaignInsights, "inline_link_clicks") > 0
        ? (sum(campaignInsights, "inline_link_clicks") / impressions) * 100
        : 0,
    cpc_all: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    leads,
    landing_page_views: actionSum(campaignInsights, "landing_page_view"),
    messaging_conversations: actionSum(
      campaignInsights,
      "onsite_conversion.messaging_conversation_started_7d"
    ),
    video_views: actionSum(campaignInsights, "video_view"),
  };

  const doc: RawMetaExport = {
    account: {
      name: account.name ?? `act_${cfg.adAccountId}`,
      id: account.account_id ?? cfg.adAccountId,
      currency: account.currency ?? "USD",
      period: range.label,
    },
    summary,
    campaigns: campaignInsights, // campaign_id, campaign_name, objective + metrikalar birga
    age,
    ads,
    adInsights,
    daily,
    limitations: [
      "Manba: Meta Graph API real-time pull (har sync intervalda avtomatik yangilanadi).",
      ...(adInsights.length === 0 ? ["Ad darajasidagi ma'lumot olinmadi — kreativlar ko'rinmaydi."] : []),
      ...(age.length === 0 ? ["Yosh kesimi olinmadi."] : []),
      ...(daily.length === 0 ? ["Kunlik timeseries olinmadi — trend chart ko'rinmaydi."] : []),
    ],
  };

  return {
    doc,
    fileName: `meta_act-${cfg.adAccountId}_${range.since}_${range.until}.json`,
    account: {
      id: account.account_id ?? cfg.adAccountId,
      name: account.name ?? `act_${cfg.adAccountId}`,
      currency: account.currency ?? "USD",
    },
  };
}
