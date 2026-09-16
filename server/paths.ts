/**
 * Umumiy yo'llar — app.ts va sync.ts o'rtasida circular import bo'lmasligi uchun ajratildi.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Snapshotlar papkasi — turli muhitlarda (lokal dev, Vercel serverless, Railway/VPS)
 * turlicha joylashishi mumkin, shuning uchun bir nechta manzil tekshiriladi.
 * SNAPSHOTS_DIR berilganda — so'rovsiz shu papka (deploy'da volume, serverless'da /tmp).
 */
const EXPLICIT_DIR = process.env.SNAPSHOTS_DIR?.trim()
  ? path.resolve(process.env.SNAPSHOTS_DIR.trim())
  : null;

const DATA_DIR_CANDIDATES = [
  path.join(__dirname, "data", "snapshots"),
  path.join(__dirname, "..", "data", "snapshots"),
  path.join(__dirname, "..", "server", "data", "snapshots"),
  path.join(__dirname, "..", "..", "server", "data", "snapshots"),
  path.resolve(process.cwd(), "server", "data", "snapshots"),
  path.resolve(process.cwd(), "data", "snapshots"),
  path.resolve(process.cwd(), "..", "server", "data", "snapshots"),
];

/**
 * Aniq ko'rsatilgan papka SO'ROVSIZ ishlatiladi (bo'sh bo'lsa ham — yangi deploy'da
 * snapshotlar hali yo'q). Aks holda mavjud fayllari bor papka tanlanadi.
 */
export const DATA_DIR =
  EXPLICIT_DIR ??
  DATA_DIR_CANDIDATES.find(
    p => fs.existsSync(p) && fs.readdirSync(p).some(f => f.endsWith(".json"))
  ) ??
  DATA_DIR_CANDIDATES.find(p => fs.existsSync(p)) ??
  path.resolve(process.cwd(), "server", "data", "snapshots");

/** Sync dvigateli snapshot yozishi mumkinmi (serverless'da /tmp dan boshqa joy yozilmaydi) */
export function canWriteSnapshots(): boolean {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const probe = path.join(DATA_DIR, `.write-probe-${Date.now()}`);
    fs.writeFileSync(probe, "1");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}
