/**
 * Google Ads API'dan batafsil analitikani tortib, snapshot fayl yozadi.
 *
 * Natija: server/data/snapshots/google_<cid>_<sana>.json  (Variant A — pull+commit).
 *
 * Ishlatish (test MCC / production):
 *   pnpm google:pull
 *
 * Kerakli environment (.env / Vercel Secrets / GitHub Secrets):
 *   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
 *   GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_MANAGER_ID, GOOGLE_ADS_CUSTOMER_IDS
 *   (ixtiyoriy) GOOGLE_ADS_USE_TEST_ACCOUNT, GOOGLE_ADS_DATE_RANGE, GOOGLE_ADS_CURRENCY
 *
 * Sozlash bo'yicha to'liq qo'llanma: docs/google-ads-api-setup.md
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfigFromEnv, pullAllAndWrite } from "../shared/googleAdsApi";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Lokal .env faylini yuklaydi (Node 20.6+ process.loadEnvFile). Fayl bo'lmasa
 * indamay o'tadi — env boshqa joydan (Vercel/GitHub Secrets) kelsa ham ishlaydi.
 * .env git'ga kirmaydi (gitignore), shuning uchun maxfiy hech narsa xavf ostida emas.
 */
const dotenvPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(dotenvPath)) {
  try {
    process.loadEnvFile(dotenvPath);
  } catch (err) {
    console.warn("[pull-google-ads] .env yuklanmadi:", (err as Error).message);
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Google Ads pull (Variant A)
Ishlatish:
  pnpm google:pull            # sozlamani env'dan o'qib, snapshot yozadi
Environment: docs/google-ads-api-setup.md → .env.example
`);
    return;
  }
  const cfg = loadConfigFromEnv();
  const files = await pullAllAndWrite(cfg);
  console.log(`\nTayyor: ${files.length} fayl yozildi.`);
  for (const f of files) console.log("  " + f);
  console.log("\nEndi snapshotni git'ga commit+push qiling — Vercel avtomatik yangilanadi.");
}

main().catch(err => {
  console.error("\nGoogle Ads pull bajarilmadi:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
