/**
 * Universal normalizer — Google Ads / Yandex Direct MCP eksportlari uchun.
 * Maydon nomlari alias xaritalari orqali taniladi (Google: cost_micros,
 * conversions; Yandex: Spend, Clicks, CampaignName...). Format biroz
 * boshqacha kelsa ham ko'p hollarda ishlaydi; tanilmagan maydonlar
 * haqida API aniq xato qaytaradi.
 */
import {
  inferGoal,
  type AdSetRef,
  type CampaignNode,
  type CreativeNode,
  type Metrics,
  type NormalizedSnapshot,
  type PlatformId,
} from "./types";

type RawRow = Record<string, any>;

const pick = (row: RawRow, aliases: string[]): number | null => {
  for (const key of aliases) {
    const v = row[key];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) return n;
    if (Number.isFinite(n) && n === 0) return 0;
  }
  return null;
};

const pickStr = (row: RawRow, aliases: string[]): string | null => {
  for (const key of aliases) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
};

const GOOGLE = {
  name: ["campaign_name", "CampaignName", "campaign", "name", "Campaign"],
  id: ["campaign_id", "CampaignId", "campaign.resource_name", "id"],
  spend: ["spend", "cost", "cost_micros", "costMicros", "amount_spent"],
  micros: true,
  impressions: ["impressions", "Impressions", "metrics.impressions"],
  clicks: ["clicks", "Clicks"],
  reach: ["reach", "Reach"],
  frequency: ["frequency", "Frequency", "avg_frequency"],
  ctr: ["ctr", "Ctr", "ctr_percent", "click_through_rate"],
  cpc: ["cpc", "average_cpc", "avg_cpc", "AvgCpc"],
  cpm: ["cpm", "average_cpm", "avg_cpm", "AvgCpm"],
  leads: ["conversions", "all_conversions", "leads", "Conversions"],
  calls: ["phone_calls", "call_clicks", "phone_through_rate"],
  videoViews: ["video_views", "video_views_15s"],
  landingPageViews: ["landing_page_views"],
};

const YANDEX = {
  name: ["Name", "CampaignName", "name", "Campaign"],
  id: ["Id", "CampaignID", "CampaignId", "id"],
  spend: ["Spend", "Cost", "spend", "Amount", "Sum"],
  micros: false,
  impressions: ["Impressions", "Impression", "impressions"],
  clicks: ["Clicks", "clicks"],
  reach: ["Reach", "Users"],
  frequency: ["AvgImpressionsPerUser", "frequency"],
  ctr: ["Ctr", "CTR", "ctr"],
  cpc: ["AvgCpc", "cpc"],
  cpm: ["Cpm", "CPM"],
  leads: ["Conversions", "Leads", "conversions", "GoalsConversionRate"],
  calls: ["Calls", "PhoneCalls"],
  videoViews: ["VideoViews", "video_views"],
  landingPageViews: ["LandingViews"],
};

export type AliasMap = typeof GOOGLE;

function rowsOf(raw: any): RawRow[] {
  for (const key of ["campaigns", "rows", "report", "data", "lineItems", "items", "result"]) {
    if (Array.isArray(raw?.[key])) return raw[key];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

/** Xom valyuta maydonini o'qiydi. Google Ads `cost_micros`/`costMicros` har doim
 * mikro birlikda keladi va kattaligidan qat'iy nazar 1e6 ga bo'linadi (kichik
 * ad'lar mikrosi <100000 bo'lsa ham to'g'ri ishlash uchun). Boshqa aliaslar
 * (spend/cost/amount) — allaqachon valyuta birligida deb qabul qilinadi. */
function pickSpend(row: RawRow, aliases: string[]): number {
  for (const key of aliases) {
    const v = row[key];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (key === "cost_micros" || key === "costMicros") return n / 1_000_000;
    return n;
  }
  return 0;
}

function metricsFrom(row: RawRow, m: AliasMap): Metrics {
  const spend = pickSpend(row, m.spend);
  const impressions = pick(row, m.impressions) ?? 0;
  const clicks = pick(row, m.clicks) ?? 0;
  const leads = pick(row, m.leads) ?? 0;
  const ctr = pick(row, m.ctr) ?? (impressions > 0 ? (clicks / impressions) * 100 : null);
  const cpc = pick(row, m.cpc) ?? (clicks > 0 ? spend / clicks : null);
  const cpm = pick(row, m.cpm) ?? (impressions > 0 ? (spend / impressions) * 1000 : null);
  return {
    spend,
    impressions,
    reach: pick(row, m.reach),
    frequency: pick(row, m.frequency) ?? null,
    clicks,
    linkClicks: clicks,
    ctr,
    linkCtr: ctr,
    cpc,
    cpm,
    leads,
    cpl: leads > 0 ? spend / leads : null,
    landingPageViews: pick(row, m.landingPageViews),
    messagingConversations: null,
    videoViews: pick(row, m.videoViews),
    calls: pick(row, m.calls) ?? undefined,
  };
}

export function normalizeGenericAds(raw: any, opts: { platform: PlatformId; syncedAt: string; file: string }): NormalizedSnapshot | null {
  const isGoogle = opts.platform === "google-ads";
  const m = isGoogle ? GOOGLE : YANDEX;
  const rows = rowsOf(raw);
  if (!rows.length) return null;

  const sample = rows[0];
  if (pickStr(sample, m.name) == null && pick(sample, m.spend) == null) {
    throw new Error(
      `Format tanilmadi: rows[0] kalitlari [${Object.keys(sample).slice(0, 12).join(", ")}]. Kutilgan maydonlar: ${isGoogle ? "campaign_name, cost_micros, clicks, conversions" : "Name, Spend, Clicks, Conversions"} (server/data/README.md)`,
    );
  }

  const campaigns: CampaignNode[] = rows.map((row, i) => {
    const metrics = metricsFrom(row, m);
    const name = pickStr(row, m.name) ?? `Campaign ${i + 1}`;
    return {
      id: String(pickStr(row, m.id) ?? `gen-${i}`),
      name: name.toUpperCase(),
      originalName: name,
      objective: null,
      expo: isGoogle ? "GOOGLE ADS" : "YANDEX DIRECT",
      platform: opts.platform,
      metrics,
      creatives: [],
      goal: inferGoal(metrics),
    };
  });
  campaigns.sort((a, b) => b.metrics.spend - a.metrics.spend);

  /* -------- Ad (kreativ) darajasi: `ads[]` kelganda kampaniyalarga bog'lanadi
   * (google-ads-api pull snapshotida har bir satr bitta ad: campaign_id,
   * ad_group_name, ad_name/ad_id, status, cost_micros ...) ------- */
  const creativesByCampaign = new Map<string, CreativeNode[]>();
  if (isGoogle && Array.isArray(raw.ads)) {
    for (const ad of raw.ads) {
      const metrics = metricsFrom(ad, m);
      const campaignId = String(ad.campaign_id ?? ad.campaignId ?? "");
      if (!campaignId) continue;
      const adset: AdSetRef | null = ad.ad_group_name
        ? {
            id: String(ad.ad_group_id ?? ad.adGroupId ?? `ag-${campaignId}`),
            name: String(ad.ad_group_name ?? "AD GROUP").toUpperCase(),
            originalName: String(ad.ad_group_name ?? "—"),
          }
        : null;
      const original = String(ad.ad_name ?? ad.adName ?? ad.ad_id ?? `AD ${campaignId}`);
      const creative: CreativeNode = {
        id: String(ad.ad_id ?? ad.adId ?? `ad-${campaignId}-${creativesByCampaign.get(campaignId)?.length ?? 0}`),
        name: original.toUpperCase(),
        originalName: original,
        campaignId,
        adset,
        status: ad.status ?? ad.ad_status ?? null,
        effectiveStatus: ad.status ?? null,
        createdTime: null,
        metrics,
        hasLeads: metrics.leads > 0,
        goal: inferGoal(metrics),
      };
      const list = creativesByCampaign.get(campaignId) || [];
      list.push(creative);
      creativesByCampaign.set(campaignId, list);
    }
    for (const list of creativesByCampaign.values()) list.sort((a, b) => b.metrics.spend - a.metrics.spend);
    for (const c of campaigns) c.creatives = creativesByCampaign.get(c.id) || [];
  }

  const sum = (f: (c: CampaignNode) => number) => campaigns.reduce((s, c) => s + f(c), 0);
  const spend = sum((c) => c.metrics.spend);
  const impressions = sum((c) => c.metrics.impressions);
  const clicks = sum((c) => c.metrics.clicks);
  const leads = sum((c) => c.metrics.leads);

  const period = pickStr(raw, ["period", "date_range", "Period"]) ?? (typeof raw.period === "object" ? `${raw.period?.start ?? ""} — ${raw.period?.end ?? ""}` : "");

  const hasAds = isGoogle && creativesByCampaign.size > 0;
  return {
    meta: {
      platform: opts.platform,
      account: {
        id: String(pickStr(raw, ["account_id", "customer_id", "AccountId", "account.name", "Login"]) ?? opts.file),
        name: pickStr(raw, ["account_name", "account", "AccountName", "customer_client_descriptive_name", "Login"]) ?? (isGoogle ? "Google Ads kabinet" : "Yandex Direct kabinet"),
        currency: pickStr(raw, ["currency", "Currency"]) ?? "USD",
      },
      period: { start: "", end: "", label: period },
      syncedAt: opts.syncedAt,
      sourceLabel: `${isGoogle ? "Google Ads" : "Yandex Direct"} snapshot · ${opts.file}`,
      file: opts.file,
      limitations: hasAds
        ? []
        : ["Ad (kreativ) darajasi bu eksportda yo'q — hisobot kampaniya darajasida."],
    },
    totals: {
      spend,
      impressions,
      reach: null,
      frequency: null,
      clicks,
      linkClicks: clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      linkCtr: impressions > 0 ? (clicks / impressions) * 100 : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      leads,
      cpl: leads > 0 ? spend / leads : null,
      landingPageViews: null,
      messagingConversations: null,
      videoViews: sum((c) => c.metrics.videoViews ?? 0),
    },
    campaigns,
    creatives: hasAds ? [...creativesByCampaign.values()].flat() : [],
    age: [],
  };
}
