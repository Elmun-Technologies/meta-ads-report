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

  if (!snapshot) {
    console.warn(
      "[static-data] Meta snapshot topilmadi — bootstrap.json yozilmadi (" +
        DATA_DIR +
        ")"
    );
    return;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    snapshot,
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
