/**
 * Meta Ads xom eksportini (MCP orqali olingan JSON) NormalizedSnapshot'ga aylantiradi.
 * Kelajakda google-ads.ts / yandex-direct.ts normalizerlari ham shu interfeysga yoziladi.
 */
import type { AdSetRef, AgeRow, CampaignNode, CreativeNode, Metrics, NormalizedSnapshot, PlatformId } from "./types";

type RawRow = Record<string, any>;
export interface RawMetaExport {
  account: { name: string; id: string; currency: string; period: string };
  summary: Record<string, number>;
  campaigns: RawRow[];
  age: RawRow[];
  ads: RawRow[];
  adInsights: RawRow[];
  limitations: string[];
}

/* ------------------------------------------------------------------ */
/* Canonical nomlash (avvalgi checkpoint logikasi saqlangan)           */
/* ------------------------------------------------------------------ */

export const standardCampaignName = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("foodera lead | retargeting")) return "FOODERA EXPO 2026 | LEADS | RETARGETING 30D | UZ | AUG26";
  if (n.includes("foodera lead | interests")) return "FOODERA EXPO 2026 | LEADS | INTERESTS FOOD DELIVERY | UZ | AUG26";
  if (n.includes("foodera lead | broad")) return "FOODERA EXPO 2026 | LEADS | BROAD | UZ | AUG26";
  if (n.includes("foodera lead 27")) return "FOODERA EXPO 2026 | LEADS | BROAD | UZ | AUG26 · MUNIS";
  if (n.includes("stand booking")) return "FOODERA EXPO 2026 | LEADS | STAND BOOKING | UZ-KZ | AUG26";
  if (n.includes("foodera expo") && n.includes("sales site")) return "FOODERA EXPO 2026 | LEADS | EXHIBITORS | UZ | SALES SITE | AUG26";
  if (n.includes("foodera expo") && n.includes("sales - copy")) return "FOODERA EXPO 2026 | LEADS | EXHIBITORS | UZ | SALES COPY | AUG26";
  if (n.includes("foodera expo") && n.includes("sales")) return "FOODERA EXPO 2026 | LEADS | EXHIBITORS | UZ | SALES | AUG26";
  if (n.includes("build pro")) return "BUILD PRO EXPO | LEADS | BROAD | UZ | AUG26";
  if (n.includes("promo show")) return "PROMOTORS SHOW | LEADS | TASHKENT | UZ | AUG26";
  if (n.includes("promotors-show")) return `PROMOTORS SHOW | LEADS | ${name.replace(/promotors-show daily 5\$ /i, "").toUpperCase()} | UZ | AUG26`;
  if (n.includes("engagement")) return "FOODERA EXPO 2026 | ENGAGEMENT | BROAD | UZ | AUG26";
  if (n.includes("new leads")) return "EXPO NOT SPECIFIED | LEADS | AUDIENCE NOT SPECIFIED | MARKET NOT SPECIFIED | AUG26";
  return `EXPO NOT SPECIFIED | ${name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} | AUG26`;
};

export const standardAdsetName = (name: string) => {
  const n = (name || "").trim().toLowerCase();
  if (!n || n === "broad") return "BROAD AUDIENCE | GEO NOT SPECIFIED | AUTO PLACEMENTS";
  if (n.includes("tashkent")) return "BROAD AUDIENCE | TASHKENT | AUTO PLACEMENTS";
  if (n.includes("engagement")) return "BROAD AUDIENCE | GEO NOT SPECIFIED | ENGAGEMENT OPTIMIZATION";
  return `${name.toUpperCase()} | GEO NOT SPECIFIED | AUTO PLACEMENTS`;
};

export const standardCreativeName = (name: string, index = 1) => {
  const n = (name || "").toLowerCase();
  const type = n.includes("video") ? "VIDEO" : n.includes("creative") || n.includes("discount") ? "STATIC / OFFER" : "AD CREATIVE";
  const angle = n.includes("discount") ? "DISCOUNT OFFER" : n.includes("broad") ? "BROAD HOOK" : n.includes("creative") ? "EXHIBITOR MESSAGE" : n.toUpperCase();
  return `${type} | ${angle} | V${String(index).padStart(2, "0")}`;
};

export const expoFor = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("foodera")) return "FOODERA EXPO 2026";
  if (n.includes("build pro")) return "BUILD PRO EXPO";
  if (n.includes("promo show") || n.includes("promotors-show")) return "PROMOTORS SHOW";
  return "EXPO NOMI ANIQLANMAGAN";
};

/* ------------------------------------------------------------------ */
/* Metric extraction                                                   */
/* ------------------------------------------------------------------ */

const num = (v: any): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const numOr = (v: any, fallback: number): number => num(v) ?? fallback;

const action = (row: RawRow, type: string): number => Number((row.actions || []).find((a: any) => a.action_type === type)?.value || 0);

export const leadsOf = (row: RawRow): number =>
  action(row, "lead") || action(row, "onsite_conversion.lead_grouped") || action(row, "offsite_complete_registration_add_meta_leads");

function metricsFromInsight(row: RawRow): { metrics: Metrics; hasLeads: boolean } {
  const leads = leadsOf(row);
  const spend = numOr(row.spend, 0);
  const linkClicks = numOr(row.inline_link_clicks, numOr(row.clicks, 0));
  const impressions = numOr(row.impressions, 0);
  return {
    hasLeads: leads > 0,
    metrics: {
      spend,
      impressions,
      reach: num(row.reach),
      frequency: num(row.frequency),
      clicks: numOr(row.clicks, 0),
      linkClicks,
      ctr: num(row.ctr),
      linkCtr: num(row.inline_link_click_ctr),
      cpc: num(row.cpc),
      cpm: num(row.cpm),
      leads,
      cpl: leads > 0 ? spend / leads : null,
      landingPageViews: action(row, "landing_page_view") || action(row, "omni_landing_page_view") || null,
      messagingConversations: action(row, "onsite_conversion.messaging_conversation_started_7d") || null,
      videoViews: num(row.video_30_sec_watched_actions?.[0]?.value),
    },
  };
}

function totalsFromSummary(summary: Record<string, number>): Metrics {
  const spend = numOr(summary.spend, 0);
  const leads = numOr(summary.leads, 0);
  return {
    spend,
    impressions: numOr(summary.impressions, 0),
    reach: num(summary.reach),
    frequency: num(summary.frequency_weighted),
    clicks: numOr(summary.clicks_all, 0),
    linkClicks: numOr(summary.link_clicks, 0),
    ctr: num(summary.ctr),
    linkCtr: num(summary.link_click_ctr),
    cpc: num(summary.cpc_all),
    cpm: num(summary.cpm),
    leads,
    cpl: leads > 0 ? spend / leads : null,
    landingPageViews: num(summary.landing_page_views),
    messagingConversations: num(summary.messaging_conversations),
    videoViews: num(summary.video_views),
  };
}

/* ------------------------------------------------------------------ */
/* Snapshot builder                                                    */
/* ------------------------------------------------------------------ */

export function normalizeMetaExport(raw: RawMetaExport, opts: { syncedAt: string; sourceLabel: string; platform?: PlatformId }): NormalizedSnapshot {
  const platform: PlatformId = opts.platform ?? "meta";

  const adsById = new Map<string, RawRow>();
  for (const ad of raw.ads || []) adsById.set(String(ad.id), ad);

  const creativesByCampaign = new Map<string, CreativeNode[]>();
  for (const insight of raw.adInsights || []) {
    const adMeta = adsById.get(String(insight.ad_id));
    const { metrics, hasLeads } = metricsFromInsight(insight);
    const adset: AdSetRef | null = insight.adset_id
      ? { id: String(insight.adset_id), name: standardAdsetName(insight.adset_name || ""), originalName: insight.adset_name || "—" }
      : null;
    const creative: CreativeNode = {
      id: String(insight.ad_id),
      name: standardCreativeName(insight.ad_name || "", 1),
      originalName: insight.ad_name || "—",
      campaignId: String(insight.campaign_id),
      adset,
      status: adMeta?.status ?? null,
      effectiveStatus: adMeta?.effective_status ?? null,
      createdTime: adMeta?.created_time ?? null,
      metrics,
      hasLeads,
    };
    const list = creativesByCampaign.get(String(insight.campaign_id)) || [];
    list.push(creative);
    creativesByCampaign.set(String(insight.campaign_id), list);
  }
  for (const list of creativesByCampaign.values()) {
    list.sort((a, b) => b.metrics.spend - a.metrics.spend);
    list.forEach((c, i) => (c.name = standardCreativeName(c.originalName, i + 1)));
  }

  const campaigns: CampaignNode[] = (raw.campaigns || []).map((row) => {
    const { metrics } = metricsFromInsight(row);
    return {
      id: String(row.campaign_id),
      name: standardCampaignName(row.campaign_name),
      originalName: row.campaign_name,
      objective: row.objective ?? null,
      expo: expoFor(row.campaign_name),
      platform,
      metrics,
      creatives: creativesByCampaign.get(String(row.campaign_id)) || [],
    };
  });
  campaigns.sort((a, b) => b.metrics.spend - a.metrics.spend);

  const age: AgeRow[] = (raw.age || []).map((row) => {
    const { metrics } = metricsFromInsight(row);
    return {
      age: row.age,
      spend: metrics.spend,
      leads: metrics.leads,
      impressions: metrics.impressions,
      reach: metrics.reach,
      frequency: metrics.frequency,
      clicks: metrics.clicks,
      ctr: metrics.ctr,
      cpm: metrics.cpm,
    };
  });

  const [start, end] = (raw.account?.period || "").split("—").map((s: string) => s.trim());

  return {
    meta: {
      platform,
      account: { id: raw.account?.id || "unknown", name: raw.account?.name || "Unknown account", currency: raw.account?.currency || "USD", externalId: raw.account?.id },
      period: { start: start || "", end: end || "", label: raw.account?.period || "" },
      syncedAt: opts.syncedAt,
      sourceLabel: opts.sourceLabel,
      limitations: raw.limitations || [],
    },
    totals: totalsFromSummary(raw.summary || {}),
    campaigns,
    creatives: [...creativesByCampaign.values()].flat(),
    age,
  };
}
