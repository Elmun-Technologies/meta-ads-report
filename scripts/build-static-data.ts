/**
 * Build vaqtida statik ma'lumot fayli yaratadi: client/public/data/bootstrap.json
 *
 * Nega kerak: Vercel kabi serverless/static hostingda /api/* serverless funksiyasi
 * ishlamasligi (yoki Deployment Protection tufayli bloklanishi) mumkin. Shunda UI
 * bo'sh qolmasligi uchun snapshot'lar build paytida oddiy JSON faylga yoziladi va
 * client API javob bermasa shu fayldan o'qiydi.
 *
 * Ishlatish: pnpm build:web (avtomatik) yoki `tsx scripts/build-static-data.ts`
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readMetaSnapshot,
  listSnapshots,
  readAmoSnapshot,
  connectionsPayload,
  readSnapshotsByPlatform,
  DATA_DIR,
} from "../server/app";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "client", "public", "data");
const OUT_FILE = path.join(OUT_DIR, "bootstrap.json");

function main() {
  const snapshot = readMetaSnapshot();
  const connections = connectionsPayload();
  const snapshots = listSnapshots().filter(s => !s.file.startsWith("amo"));
  const crm = readAmoSnapshot();
  /** Har bir ulangan platforma (meta/google-ads/yandex-direct) uchun eng yangi
   * snapshot — API ishlamay qolsa ham client platforma almashtirsa to'g'ri
   * ma'lumot ko'rsatilishi uchun (aks holda doim faqat Meta qaytardi). */
  const snapshotsByPlatform = readSnapshotsByPlatform();

  if (!snapshot && Object.keys(snapshotsByPlatform).length === 0) {
    console.warn(
      "[static-data] Hech qanday snapshot topilmadi — bootstrap.json yozilmadi (" +
        DATA_DIR +
        ")"
    );
    return;
  }

  /** Barcha platformalarni birlashtirgan "all" snapshot yaratish */
  const allSnapshots = Object.values(snapshotsByPlatform).filter(Boolean) as typeof snapshot[];
  let allSnapshot: typeof snapshot | null = null;
  if (allSnapshots.length > 0) {
    const totals = { spend: 0, leads: 0, cpl: 0, impressions: 0, clicks: 0, ctr: 0, reach: 0, cpm: 0, cpc: 0, landingPageViews: 0, linkClicks: 0, videoViews: 0, messagingConversations: 0, frequency: 0, linkCtr: 0, postEngagement: 0, reactions: 0, comments: 0, saves: 0, messagingFirstReply: 0 };
    const allCampaigns: any[] = [];
    const allCreatives: any[] = [];
    const allAge: any[] = [];

    for (const s of allSnapshots) {
      if (!s) continue;
      totals.spend += s.totals.spend || 0;
      totals.leads += s.totals.leads || 0;
      totals.impressions += s.totals.impressions || 0;
      totals.clicks += s.totals.clicks || 0;
      totals.reach += s.totals.reach || 0;
      totals.landingPageViews += s.totals.landingPageViews || 0;
      totals.linkClicks += s.totals.linkClicks || 0;
      totals.videoViews += s.totals.videoViews || 0;
      totals.postEngagement = (totals.postEngagement || 0) + ((s.totals as any).postEngagement || 0);
      totals.reactions = (totals.reactions || 0) + ((s.totals as any).reactions || 0);
      totals.comments = (totals.comments || 0) + ((s.totals as any).comments || 0);
      totals.saves = (totals.saves || 0) + ((s.totals as any).saves || 0);
      allCampaigns.push(...s.campaigns);
      allCreatives.push(...s.creatives);
      allAge.push(...s.age);
    }

    if (totals.leads > 0) totals.cpl = totals.spend / totals.leads;
    if (totals.impressions > 0) totals.ctr = (totals.clicks / totals.impressions) * 100;
    if (totals.impressions > 0) totals.cpm = (totals.spend / totals.impressions) * 1000;
    if (totals.clicks > 0) totals.cpc = totals.spend / totals.clicks;

    allSnapshot = {
      meta: {
        platform: "all" as any,
        period: allSnapshots[0]!.meta.period,
        account: { id: "all", name: "Jami Barcha Manbalar", currency: allSnapshots[0]!.meta.account.currency },
        sourceLabel: "Yagona Oyna — barcha platformalar birlashtirilgan",
        syncedAt: new Date().toISOString(),
        limitations: []
      },
      totals: totals as any,
      campaigns: allCampaigns,
      creatives: allCreatives,
      age: allAge
    };

    snapshotsByPlatform["all" as any] = allSnapshot;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    snapshot: allSnapshot ?? snapshot,
    snapshotsByPlatform,
    connections,
    snapshots,
    crm,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload), "utf-8");

  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(0);
  console.log(
    `[static-data] data/bootstrap.json yozildi (${kb} KB) · ${snapshots.length} ta snapshot · platformalar: ${Object.keys(snapshotsByPlatform).join(", ")} · CRM: ${crm ? "bor" : "yo'q"}`
  );
}

main();
