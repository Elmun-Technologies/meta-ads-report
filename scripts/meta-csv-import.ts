/**
 * Meta Ads Manager'dan qo'lda eksport qilingan CSV hisobotni (Manus/MCP o'rniga)
 * server/data/README.md dagi Meta snapshot formatiga (RawMetaExport) o'giradi.
 *
 * Ads Manager'da kerakli ustunlar (Customize columns / pivot table metrics):
 *   Campaign name, Ad set name, Ad name, Age, Gender, Reach, Impressions,
 *   Frequency, Result type, Results, Amount spent (USD), CTR (all), Link clicks,
 *   CPC (cost per link click), CPM, Clicks (all), CPC (all), Delivery status,
 *   Reporting starts, Reporting ends
 *
 * Foydalanish:
 *   npx tsx scripts/meta-csv-import.ts <csv-fayl> <account-id> "<account-name>" [out-fayl]
 *
 * Masalan:
 *   npx tsx scripts/meta-csv-import.ts ~/Downloads/report.csv 1883723989171211 "Sof-Expo l Nazir"
 */
import fs from "fs";
import path from "path";

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const num = (v: string | undefined): number => {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
};

const LEAD_RESULT_TYPES = new Set(["Leads (form)", "Leads", "Website leads"]);
const MESSAGING_RESULT_TYPES = new Set(["Messaging conversations started"]);

function slug(...parts: string[]): string {
  return parts
    .map((p) => p.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""))
    .filter(Boolean)
    .join("__") || "unknown";
}

function isActiveDelivery(status: string): boolean {
  const s = status.toLowerCase();
  return s === "active" || s === "delivering";
}

interface Agg {
  spend: number;
  impressions: number;
  reach: number;
  clicksAll: number;
  linkClicks: number;
  leads: number;
  messaging: number;
  rows: number;
}

function emptyAgg(): Agg {
  return { spend: 0, impressions: 0, reach: 0, clicksAll: 0, linkClicks: 0, leads: 0, messaging: 0, rows: 0 };
}

function addRow(agg: Agg, r: Row) {
  agg.spend += num(r["Amount spent (USD)"]);
  agg.impressions += num(r["Impressions"]);
  agg.reach += num(r["Reach"]);
  agg.clicksAll += num(r["Clicks (all)"]);
  agg.linkClicks += num(r["Link clicks"]);
  agg.rows += 1;
  const resultType = (r["Result type"] || "").trim();
  const results = num(r["Results"]);
  if (LEAD_RESULT_TYPES.has(resultType)) agg.leads += results;
  if (MESSAGING_RESULT_TYPES.has(resultType)) agg.messaging += results;
}

/** Insight-shaped raw row (matches shared/normalize.ts metricsFromInsight expectations) */
function toInsightRow(agg: Agg, extra: Record<string, unknown>) {
  const ctr = agg.impressions > 0 ? (agg.clicksAll / agg.impressions) * 100 : 0;
  const linkCtr = agg.impressions > 0 ? (agg.linkClicks / agg.impressions) * 100 : 0;
  const cpc = agg.clicksAll > 0 ? agg.spend / agg.clicksAll : 0;
  const cpm = agg.impressions > 0 ? (agg.spend / agg.impressions) * 1000 : 0;
  const actions = [
    { action_type: "lead", value: String(agg.leads) },
    { action_type: "link_click", value: String(agg.linkClicks) },
    ...(agg.messaging > 0
      ? [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: String(agg.messaging) }]
      : []),
  ];
  return {
    ...extra,
    impressions: String(agg.impressions),
    reach: String(agg.reach),
    frequency: agg.reach > 0 ? String(agg.impressions / agg.reach) : "0",
    clicks: String(agg.clicksAll),
    inline_link_clicks: String(agg.linkClicks),
    ctr: String(ctr),
    inline_link_click_ctr: String(linkCtr),
    spend: String(agg.spend),
    cpc: String(cpc),
    cpm: String(cpm),
    actions,
  };
}

function main() {
  const [, , csvPath, accountId, accountNameArg, outArg] = process.argv;
  if (!csvPath || !accountId) {
    console.error(
      'Foydalanish: npx tsx scripts/meta-csv-import.ts <csv-fayl> <account-id> "<account-name>" [out-fayl]'
    );
    process.exit(1);
  }
  const accountName = accountNameArg || "Meta Ads kabinet";
  const text = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(text).filter((r) => r["Campaign name"]);
  if (!rows.length) {
    console.error("CSV'da qatorlar topilmadi — ustun nomlarini tekshiring.");
    process.exit(1);
  }

  const periodStart = rows[0]["Reporting starts"] || "";
  const periodEnd = rows[0]["Reporting ends"] || "";

  // ---- campaigns ----
  const campaignAgg = new Map<string, Agg>();
  const campaignMeta = new Map<string, { name: string }>();
  for (const r of rows) {
    const name = r["Campaign name"];
    const id = slug(name);
    if (!campaignAgg.has(id)) {
      campaignAgg.set(id, emptyAgg());
      campaignMeta.set(id, { name });
    }
    addRow(campaignAgg.get(id)!, r);
  }
  const campaigns = [...campaignAgg.entries()].map(([id, agg]) =>
    toInsightRow(agg, {
      account_id: accountId,
      campaign_id: id,
      campaign_name: campaignMeta.get(id)!.name,
      date_start: periodStart,
      date_stop: periodEnd,
    })
  );

  // ---- ads / adInsights (campaign + adset + ad name) ----
  const adAgg = new Map<string, Agg>();
  const adMeta = new Map<
    string,
    { campaignId: string; campaignName: string; adsetName: string; adName: string; delivering: boolean }
  >();
  for (const r of rows) {
    const campaignName = r["Campaign name"];
    const campaignId = slug(campaignName);
    const adsetName = r["Ad set name"] || "—";
    const adName = r["Ad name"] || r["Ads"] || "—";
    const id = slug(campaignName, adsetName, adName);
    if (!adAgg.has(id)) {
      adAgg.set(id, emptyAgg());
      adMeta.set(id, {
        campaignId,
        campaignName,
        adsetName,
        adName,
        delivering: false,
      });
    }
    addRow(adAgg.get(id)!, r);
    if (isActiveDelivery(r["Delivery status"] || "")) adMeta.get(id)!.delivering = true;
  }
  const ads = [...adMeta.entries()].map(([id, m]) => ({
    id,
    name: m.adName,
    status: m.delivering ? "ACTIVE" : "PAUSED",
    effective_status: m.delivering ? "ACTIVE" : "PAUSED",
    campaign_id: m.campaignId,
    adset_id: slug(m.campaignName, m.adsetName),
    account_id: accountId,
  }));
  const adInsights = [...adAgg.entries()].map(([id, agg]) => {
    const m = adMeta.get(id)!;
    return toInsightRow(agg, {
      account_id: accountId,
      campaign_id: m.campaignId,
      campaign_name: m.campaignName,
      adset_id: slug(m.campaignName, m.adsetName),
      adset_name: m.adsetName,
      ad_id: id,
      ad_name: m.adName,
      date_start: periodStart,
      date_stop: periodEnd,
    });
  });

  // ---- age ----
  const ageAgg = new Map<string, Agg>();
  for (const r of rows) {
    const age = r["Age"] || "Unknown";
    if (!ageAgg.has(age)) ageAgg.set(age, emptyAgg());
    addRow(ageAgg.get(age)!, r);
  }
  const age = [...ageAgg.entries()].map(([ageLabel, agg]) => ({
    ...toInsightRow(agg, { account_id: accountId, age: ageLabel, date_start: periodStart, date_stop: periodEnd }),
    age: ageLabel,
  }));

  // ---- summary ----
  const totalAgg = emptyAgg();
  for (const r of rows) addRow(totalAgg, r);
  const summary = {
    impressions: totalAgg.impressions,
    reach: totalAgg.reach,
    clicks_all: totalAgg.clicksAll,
    link_clicks: totalAgg.linkClicks,
    spend: Math.round(totalAgg.spend * 100) / 100,
    leads: totalAgg.leads,
    landing_page_views: 0,
    messaging_conversations: totalAgg.messaging,
    video_views: 0,
    frequency_weighted: totalAgg.reach > 0 ? totalAgg.impressions / totalAgg.reach : 0,
    ctr: totalAgg.impressions > 0 ? (totalAgg.clicksAll / totalAgg.impressions) * 100 : 0,
    link_click_ctr: totalAgg.impressions > 0 ? (totalAgg.linkClicks / totalAgg.impressions) * 100 : 0,
    cpc_all: totalAgg.clicksAll > 0 ? totalAgg.spend / totalAgg.clicksAll : 0,
    cpc_link: totalAgg.linkClicks > 0 ? totalAgg.spend / totalAgg.linkClicks : 0,
    cpm: totalAgg.impressions > 0 ? (totalAgg.spend / totalAgg.impressions) * 1000 : 0,
    cost_per_lead: totalAgg.leads > 0 ? totalAgg.spend / totalAgg.leads : 0,
  };

  const raw = {
    account: {
      name: accountName,
      id: `act_${accountId}`,
      currency: "USD",
      period: `${periodStart} — ${periodEnd}`,
    },
    summary,
    campaigns,
    age,
    ads,
    adInsights,
    limitations: [
      "Bu snapshot Meta Ads Manager CSV eksportidan (Manus/MCP emas) qurilgan — video views, reaction/comment/share kabi ba'zi harakat turlari CSV'da yo'q, faqat spend/impressions/reach/clicks/leads mavjud.",
      "campaign_id / ad_id / adset_id — CSV'da haqiqiy Meta ID yo'qligi sababli nom asosida generatsiya qilingan (barqaror, lekin Meta'ning o'zidagi ID bilan mos emas).",
    ],
  };

  const outFile =
    outArg || `server/data/snapshots/meta_act-${accountId}_${(periodStart || "period").replace(/[^0-9-]/g, "")}.json`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(raw, null, 2));
  console.log(`Yozildi: ${outFile}`);
  console.log(
    `Kampaniyalar: ${campaigns.length}, ad'lar: ${ads.length}, yosh guruhlari: ${age.length}, jami xarajat: $${summary.spend}, leads: ${summary.leads}`
  );
}

main();
