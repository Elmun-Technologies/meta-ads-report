/**
 * Google Ads pull snapshot normalizerining OFFLINE tekshiruvi (tarmoq/kredensial
 * talab qilmaydi). Google Ads API pull yozadigan formatdagi namunani
 * normalizeGenericAds orqali o'tkazib, kutilgan natijani tekshiradi:
 *   - cost_micros to'g'ri 1e6 ga bo'linadi (kichik ad mikrosi ham!)
 *   - ads[] -> creatives (reklama darajasi) kampaniyalarga bog'lanadi
 *   - legacy rows[] kampaniya KPI to'g'ri yig'iladi
 *
 * Ishlatish: pnpm google:test:normalize
 */
import { normalizeGenericAds } from "../shared/generic";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name} ${extra}`);
  }
}

// Google Ads API pull ishlab chiqaradigan formatga mos sinov dokumenti.
// 3 ta kampaniya, birida 2 ta ad. Kichik ad mikrosi (50000 = 0.05$) bo'linishni sinaydi.
const sample = {
  source: "google-ads-api",
  account_name: "Sof-Expo Test",
  customer_id: "1234567890",
  currency: "USD",
  period: "test",
  rows: [
    { campaign_id: "1", campaign_name: "Foodera Search", cost_micros: 12000000, impressions: 5000, clicks: 250, conversions: 4, ctr: 5.0 },
    { campaign_id: "2", campaign_name: "Foodera Display", cost_micros: 3000000, impressions: 90000, clicks: 120, conversions: 1, ctr: 0.13 },
  ],
  ads: [
    { campaign_id: "1", ad_group_name: "Generic Search", ad_id: "a1", ad_name: "Main keyword ad", status: "ENABLED", cost_micros: 50000, impressions: 100, clicks: 8, conversions: 1, ctr: 8 },
    { campaign_id: "1", ad_group_name: "Generic Search", ad_id: "a2", ad_name: "Discount ad", status: "PAUSED", cost_micros: 11950000, impressions: 4900, clicks: 242, conversions: 3, ctr: 4.94 },
    { campaign_id: "2", ad_group_name: "Display", ad_id: "a3", ad_name: null, status: "ENABLED", cost_micros: 3000000, impressions: 90000, clicks: 120, conversions: 1, ctr: 0.13 },
  ],
};

const snap = normalizeGenericAds(sample, {
  platform: "google-ads",
  syncedAt: new Date().toISOString(),
  file: "google_1234567890_test.json",
});

console.log("normalizeGenericAds (google-ads, pull format):\n");

ok("normalized bo'sh emas", snap != null);
if (!snap) process.exit(1);

// meta/account
ok("account nomi o'qildi", snap.meta.account.name === "Sof-Expo Test");
ok("platform google-ads", snap.meta.platform === "google-ads");

// cost_micros bo'linishi
const c1 = snap.campaigns.find(c => c.id === "1");
ok("kampaniya1 spend = 12.00", c1 ? Math.abs(c1.metrics.spend - 12) < 1e-9 : false, `-> ${c1?.metrics.spend}`);

// totals
const totalSpend = snap.totals.spend;
ok("jami spend = 15.00", Math.abs(totalSpend - 15) < 1e-9, `-> ${totalSpend}`);
ok("jami leads = 5", snap.totals.leads === 5);
ok("jami impressions = 95000", snap.totals.impressions === 95000);

// creatives (ads) bog'lanishi
ok("creatives soni = 3", snap.creatives.length === 3, `-> ${snap.creatives.length}`);
ok("kampaniya1 da 2 creative", (snap.campaigns.find(c => c.id === "1")?.creatives.length ?? 0) === 2);
ok("adset (ad_group) bog'langan", snap.creatives[0]?.adset?.name === "GENERIC SEARCH");
ok("kreativ status saqlandi", snap.creatives.some(c => c.status === "PAUSED"));

// kichik ad mikrosi 50000 = 0.05$ bo'linishi
const smallAd = snap.creatives.find(c => c.id === "a1");
ok("kichik ad spend = 0.05", smallAd ? Math.abs(smallAd.metrics.spend - 0.05) < 1e-9 : false, `-> ${smallAd?.metrics.spend}`);
ok("kichik ad hasLeads", smallAd?.hasLeads === true);

// limitations ad'lar bo'lsa bo'sh bo'ladi
ok("limitations bo'sh (ad'lar bor)", Array.isArray(snap.meta.limitations) && snap.meta.limitations.length === 0);

console.log(`\nNatija: ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
