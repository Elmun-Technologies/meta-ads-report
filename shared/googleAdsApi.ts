/**
 * Google Ads API — REST client (OAuth 2.0 + GAQL SearchStream).
 *
 * Dashboard hozir Google ma'lumotini faqat snapshot fayl orqali oladi
 * (server/data/snapshots/google_*.json). Ushbu modul — Google Ads API'dan
 * to'g'ridan-to'g'ri batafsil (kampaniya + reklama + kunlik + qurilma + kalit so'z)
 * ma'lumotni tortib, o'sha snapshot formatiga tayyorlaydigan qatlam.
 *
 * Rest API (searchStream) ishlatiladi — gRPC talab qilmaydi, faqat HTTP.
 * Kirish talab qilinadigan sozlamalar (environment) uchun:
 *   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
 *   GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_MANAGER_ID, GOOGLE_ADS_CUSTOMER_IDS
 *
 * Google Ads REST qaytaradigan row strukturasi (har bir searchStream natijasi):
 *   { campaign: {id,name,status}, metrics: {costMicros, clicks, impressions,
 *     conversions, ctr, averageCpc}, segments: {device, date}, ... }
 * Raqamlar ba'zan string, ba'zan number bo'lib keladi; shuning uchun tolerant o'qiladi.
 */
import fs from "node:fs";
import path from "node:path";

export const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v25";

/* ------------------------------------------------------------------ */
/* Konfiguratsiya                                                      */
/* ------------------------------------------------------------------ */

export interface GoogleAdsConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** MCC (Menedjer) customer id — login-customer-id header uchun */
  managerId?: string;
  /** Analitika tortiladigan customer id'lar ro'yxati */
  customerIds: string[];
  /** Test MCC bo'lsa true (o'shanda login-customer-id majburiy emas) */
  useTestAccount: boolean;
  /** Ma'lumot davri — GAQL "DURING" so'zi (masalan LAST_30_DAYS) */
  dateRange: string;
  currency: string;
  apiVersion: string;
}

export function loadConfigFromEnv(env = process.env): GoogleAdsConfig {
  const required = [
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
  ];
  const missing = required.filter(k => !env[k]);
  if (missing.length)
    throw new Error(
      `Google Ads sozlamalari yetishmayapti: ${missing.join(", ")}. .env / Vercel Secrets ga qo'ying (docs/google-ads-api-setup.md).`
    );
  const cids = String(env.GOOGLE_ADS_CUSTOMER_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (!cids.length)
    throw new Error(
      "GOOGLE_ADS_CUSTOMER_IDS bo'sh — analitika kerak bo'lgan customer id(lar)ni vergul bilan bering."
    );
  return {
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN!,
    managerId: env.GOOGLE_ADS_MANAGER_ID || undefined,
    customerIds: cids,
    useTestAccount: env.GOOGLE_ADS_USE_TEST_ACCOUNT === "true",
    dateRange: env.GOOGLE_ADS_DATE_RANGE || "LAST_30_DAYS",
    currency: env.GOOGLE_ADS_CURRENCY || "USD",
    apiVersion: env.GOOGLE_ADS_API_VERSION || GOOGLE_ADS_API_VERSION,
  };
}

/* ------------------------------------------------------------------ */
/* OAuth — refresh_token → access_token                                */
/* ------------------------------------------------------------------ */

export interface OAuthToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export async function refreshAccessToken(cfg: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth refresh token xato (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = (await res.json()) as OAuthToken;
  if (!data.access_token)
    throw new Error("OAuth javobida access_token yo'q. Refresh token eskirgan bo'lishi mumkin.");
  return data.access_token;
}

/* ------------------------------------------------------------------ */
/* Tolerant field access — string/number va ixtiyoriy bo'shliq          */
/* ------------------------------------------------------------------ */

type AnyRow = Record<string, any>;

const numOf = (v: unknown): number => {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const leaf = (row: AnyRow, seg: string[]): unknown => {
  let v: any = row;
  for (const k of seg) {
    if (v == null || typeof v !== "object") return undefined;
    v = v[k];
  }
  return v;
};

const strLeaf = (row: AnyRow, seg: string[]): string | null => {
  const v = leaf(row, seg);
  return v == null || v === "" ? null : String(v);
};

const numLeaf = (row: AnyRow, seg: string[]): number => numOf(leaf(row, seg));

/* ------------------------------------------------------------------ */
/* GAQL so'rovlar                                                      */
/* ------------------------------------------------------------------ */

const METRIC_FIELDS = [
  "metrics.impressions",
  "metrics.clicks",
  "metrics.ctr",
  "metrics.average_cpc",
  "metrics.cost_micros",
  "metrics.conversions",
].join(", ");

const CAMPAIGN_COLS = "campaign.id, campaign.name, campaign.status";
const AD_COLS = `${CAMPAIGN_COLS}, ad_group.id, ad_group.name, ad_group_ad.status, ad_group_ad.ad.id`;

export const GAQL = {
  /** Kampaniya darajasi — bitta customer uchun yig'indi */
  campaigns(dateRange: string): string {
    return `SELECT ${CAMPAIGN_COLS}, ${METRIC_FIELDS}
      FROM campaign
      WHERE segments.date DURING ${dateRange} AND campaign.status != 'REMOVED'`;
  },
  /** Reklama (ad) darajasi — kun bo'yicha; JS da ad bo'yicha yig'iladi */
  ads(dateRange: string): string {
    return `SELECT ${AD_COLS}, segments.date, ${METRIC_FIELDS}
      FROM ad_group_ad
      WHERE segments.date DURING ${dateRange}
        AND campaign.status != 'REMOVED' AND ad_group_ad.status != 'REMOVED'`;
  },
  /** Kampaniya × kun — trend uchun */
  daily(dateRange: string): string {
    return `SELECT ${CAMPAIGN_COLS}, segments.date, ${METRIC_FIELDS}
      FROM campaign
      WHERE segments.date DURING ${dateRange} AND campaign.status != 'REMOVED'`;
  },
  /** Kampaniya × qurilma (device) */
  device(dateRange: string): string {
    return `SELECT ${CAMPAIGN_COLS}, segments.date, segments.device, ${METRIC_FIELDS}
      FROM campaign
      WHERE segments.date DURING ${dateRange} AND campaign.status != 'REMOVED'`;
  },
  /** Kalit so'z (keyword) — Search kampaniyalari uchun */
  keywords(dateRange: string): string {
    return `SELECT ${CAMPAIGN_COLS}, segments.date, keyword_view.keyword.id,
        keyword_view.keyword.text, keyword_view.keyword.match_type, ${METRIC_FIELDS}
      FROM keyword_view
      WHERE segments.date DURING ${dateRange} AND campaign.status != 'REMOVED'`;
  },
};

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

export interface SearchResultRow extends AnyRow {}

export class GoogleAdsClient {
  private accessToken: string | null = null;
  constructor(private cfg: GoogleAdsConfig) {}

  async auth(): Promise<string> {
    if (!this.accessToken)
      this.accessToken = await refreshAccessToken({
        clientId: this.cfg.clientId,
        clientSecret: this.cfg.clientSecret,
        refreshToken: this.cfg.refreshToken,
      });
    return this.accessToken;
  }

  /**
   * GAQL so'rovni searchStream orqali yuboradi va barcha batch'larning
   * `results[]` qatorlarini (tekislangan) qaytaradi.
   */
  async runQuery(customerId: string, query: string): Promise<SearchResultRow[]> {
    const token = await this.auth();
    const url = `https://googleads.googleapis.com/${this.cfg.apiVersion}/customers/${customerId}/googleAds:searchStream`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "developer-token": this.cfg.developerToken,
      "Content-Type": "application/json",
    };
    // Test MCC yoki haqiqiy MCC — so'rov login-customer-id ni talab qiladi
    if (this.cfg.managerId) headers["login-customer-id"] = this.cfg.managerId;
    else if (this.cfg.useTestAccount)
      throw new Error("Test rejimda GOOGLE_ADS_MANAGER_ID (test MCC) kerak.");

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Ads API xato (${res.status}): ${text.slice(0, 500)}`);
    }
    const batches = (await res.json()) as { results?: SearchResultRow[] }[];
    const out: SearchResultRow[] = [];
    for (const b of batches || []) out.push(...(b.results || []));
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Natijalarni tayyorlash (aggregatsiya)                               */
/* ------------------------------------------------------------------ */

/** Har bir searchStream row'dan kerakli metric'larni o'qib flat record qaytaradi */
function readMetrics(row: SearchResultRow) {
  const costMicros = numLeaf(row, ["metrics", "costMicros"]);
  const impressions = numLeaf(row, ["metrics", "impressions"]);
  const clicks = numLeaf(row, ["metrics", "clicks"]);
  const conversions = numLeaf(row, ["metrics", "conversions"]);
  // CTR ulushi impressions bilan hisoblanadi (dashboard % ishlatadi).
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  return { cost_micros: costMicros, impressions, clicks, conversions, ctr };
}

const addTo = <T extends Record<string, any>>(
  map: Map<string, T>,
  key: string,
  make: () => T,
  fn: (rec: T, metrics: ReturnType<typeof readMetrics>) => void,
  metrics: ReturnType<typeof readMetrics>
) => {
  const rec = map.get(key) ?? make();
  fn(rec, metrics);
  map.set(key, rec);
};

const campaignFields = (row: SearchResultRow) => ({
  campaign_id: strLeaf(row, ["campaign", "id"]),
  campaign_name: strLeaf(row, ["campaign", "name"]),
  campaign_status: strLeaf(row, ["campaign", "status"]),
});

export interface PullResult {
  customer: { id: string; name: string };
  currency: string;
  periodLabel: string;
  campaigns: AnyRow[];
  ads: AnyRow[];
  daily: AnyRow[];
  devices: AnyRow[];
  keywords: AnyRow[];
}

/** Bir customer uchun barcha o'lchamlarni tortib, yig'indi qiladi */
export async function pullCustomer(
  client: GoogleAdsClient,
  customerId: string,
  dateRange: string,
  currency: string
): Promise<PullResult> {
  const [campaignRows, adRows, dailyRows, deviceRows, keywordRows] = await Promise.all([
    client.runQuery(customerId, GAQL.campaigns(dateRange)),
    client.runQuery(customerId, GAQL.ads(dateRange)),
    client.runQuery(customerId, GAQL.daily(dateRange)),
    client.runQuery(customerId, GAQL.device(dateRange)),
    client.runQuery(customerId, GAQL.keywords(dateRange)),
  ]);

  const accountName =
    strLeaf(campaignRows[0], ["customer", "descriptiveName"]) ||
    strLeaf(campaignRows[0], ["customer", "id"]) ||
    customerId;

  // --- kampaniya (searchStream allaqachon kampaniya bo'yicha aggregate) ---
  const campaigns: AnyRow[] = campaignRows
    .map(r => {
      const cf = campaignFields(r);
      const m = readMetrics(r);
      return { ...cf, ...m };
    })
    .filter(r => r.campaign_id);

  // --- reklama (ad): kun satrlari ad bo'yicha yig'iladi ---
  const adMap = new Map<string, AnyRow>();
  for (const r of adRows) {
    const cf = campaignFields(r);
    const m = readMetrics(r);
    const key = `${cf.campaign_id}:${strLeaf(r, ["ad_group", "id"])}:${strLeaf(r, ["ad_group_ad", "ad", "id"])}`;
    addTo(
      adMap,
      key,
      () => ({
        campaign_id: cf.campaign_id,
        campaign_name: cf.campaign_name,
        ad_group_id: strLeaf(r, ["ad_group", "id"]),
        ad_group_name: strLeaf(r, ["ad_group", "name"]),
        ad_id: strLeaf(r, ["ad_group_ad", "ad", "id"]),
        ad_name: strLeaf(r, ["ad_group_ad", "ad", "id"]) ?? null,
        status: strLeaf(r, ["ad_group_ad", "status"]),
        cost_micros: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
      }),
      (rec, m) => {
        rec.cost_micros += m.cost_micros;
        rec.impressions += m.impressions;
        rec.clicks += m.clicks;
        rec.conversions += m.conversions;
        if (rec.impressions > 0) rec.ctr = (rec.clicks / rec.impressions) * 100;
      },
      m
    );
  }
  const ads = [...adMap.values()];

  // --- kunlik (kampaniya × date) ---
  const daily: AnyRow[] = dailyRows
    .map(r => {
      const cf = campaignFields(r);
      const m = readMetrics(r);
      return { ...cf, date: strLeaf(r, ["segments", "date"]), ...m };
    })
    .filter(r => r.campaign_id && r.date);

  // --- qurilma: kampaniya × device yig'indisi (kunlar orqali) ---
  const deviceMap = new Map<string, AnyRow>();
  for (const r of deviceRows) {
    const m = readMetrics(r);
    const device = strLeaf(r, ["segments", "device"]) || "UNKNOWN";
    addTo(
      deviceMap,
      device,
      () => ({ device, cost_micros: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0 }),
      (rec, m) => {
        rec.cost_micros += m.cost_micros;
        rec.impressions += m.impressions;
        rec.clicks += m.clicks;
        rec.conversions += m.conversions;
        if (rec.impressions > 0) rec.ctr = (rec.clicks / rec.impressions) * 100;
      },
      m
    );
  }
  const devices = [...deviceMap.values()].sort((a, b) => b.cost_micros - a.cost_micros);

  // --- kalit so'z: keyword bo'yicha yig'indi ---
  const kwMap = new Map<string, AnyRow>();
  for (const r of keywordRows) {
    const cf = campaignFields(r);
    const m = readMetrics(r);
    const text = strLeaf(r, ["keyword_view", "keyword", "text"]) || "—";
    const key = `${cf.campaign_id}:${text}`;
    addTo(
      kwMap,
      key,
      () => ({
        campaign_id: cf.campaign_id,
        campaign_name: cf.campaign_name,
        keyword: text,
        match_type: strLeaf(r, ["keyword_view", "keyword", "match_type"]),
        cost_micros: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
      }),
      (rec, m) => {
        rec.cost_micros += m.cost_micros;
        rec.impressions += m.impressions;
        rec.clicks += m.clicks;
        rec.conversions += m.conversions;
        if (rec.impressions > 0) rec.ctr = (rec.clicks / rec.impressions) * 100;
      },
      m
    );
  }
  const keywords = [...kwMap.values()].sort((a, b) => b.cost_micros - a.cost_micros);

  return {
    customer: { id: customerId, name: accountName },
    currency,
    periodLabel: dateRange.replace(/_/g, " ").toLowerCase(),
    campaigns,
    ads,
    daily,
    devices,
    keywords,
  };
}

/* ------------------------------------------------------------------ */
/* Snapshot fayl yozish                                                */
/* ------------------------------------------------------------------ */

/**
 * PullResult ni `google_<cid>_<davr>.json` snapshotiga yig'adi.
 * `rows[]` — eski generic normalizer taniydigan kampaniya satrlari
 * (shu tufayli mavjud /api/snapshot?platform=google-ads ishlaydi), qo'shimcha
 * batafsil bo'limlar (ads/daily/devices/keywords) birga saqlanadi.
 */
export function buildSnapshotDoc(p: PullResult, opts: { filename: string; now: string }): Record<string, any> {
  const rows = p.campaigns
    .filter(c => (c.cost_micros as number) > 0 || (c.impressions as number) > 0)
    .map(c => ({
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      status: c.campaign_status,
      cost_micros: c.cost_micros,
      impressions: c.impressions,
      clicks: c.clicks,
      conversions: c.conversions,
      ctr: c.ctr,
    }));
  return {
    source: "google-ads-api",
    account_name: p.customer.name,
    customer_id: p.customer.id,
    currency: p.currency,
    period: opts.filename,
    synced_at: opts.now,
    date_range: p.periodLabel,
    rows,
    campaigns: p.campaigns,
    ads: p.ads,
    daily: p.daily,
    devices: p.devices,
    keywords: p.keywords,
  };
}

/** SNAPSHOT papkasini topadi (server/app.ts dagi mantiqqa o'xshash) */
export function resolveSnapshotsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "server", "data", "snapshots"),
    path.resolve(process.cwd(), "data", "snapshots"),
  ];
  const found = candidates.find(c => fs.existsSync(c));
  return found ?? candidates[0];
}

/** Google Ads API'dan tortib, snapshot faylni yozadi. Fayl nomini qaytaradi. */
export async function pullAllAndWrite(cfg: GoogleAdsConfig, dir = resolveSnapshotsDir()): Promise<string[]> {
  const client = new GoogleAdsClient(cfg);
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  const written: string[] = [];
  fs.mkdirSync(dir, { recursive: true });

  for (const cid of cfg.customerIds) {
    // eslint-disable-next-line no-console
    console.log(`[google-ads] ${cid} → tortilyapti (${cfg.dateRange})...`);
    const p = await pullCustomer(client, cid, cfg.dateRange, cfg.currency);
    const filename = `google_${cid.replace(/\D/g, "")}_${stamp}.json`;
    const doc = buildSnapshotDoc(p, { filename, now: now.toISOString() });
    const full = path.join(dir, filename);
    fs.writeFileSync(full, JSON.stringify(doc, null, 2), "utf-8");
    written.push(full);
    // eslint-disable-next-line no-console
    console.log(`[google-ads] ${filename} yozildi (${p.campaigns.length} kampaniya, ${p.ads.length} ad, ${p.daily.length} kun, ${p.keywords.length} keyword).`);
  }
  return written;
}
