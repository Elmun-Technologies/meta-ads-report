/**
 * Uzoq muddatli process entry (Railway/Render/VPS) — SSE + fs.watch yoqilgan.
 * Vercel'da bu fayl ishlatilmaydi — api/[[...slug]].ts o'rniga createApp("serverless") chaqiradi.
 */
import { createApp, watchSnapshots, DATA_DIR } from "./app";

const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);

const app = createApp("server");
watchSnapshots();
app.listen(PORT, () => {
  console.log(`[api] http://localhost:${PORT} · snapshots: ${DATA_DIR}`);
});
