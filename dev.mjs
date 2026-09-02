/**
 * Dev orchestrator — API server (3001) va Vite dev server (3000) ni birga ishga tushiradi.
 * Vite /api so'rovlarini API serverga proxy qiladi (vite.config.ts → server.proxy).
 */
import { spawn } from "node:child_process";

const children = [
  spawn("pnpm", ["run", "dev:api"], { stdio: ["ignore", "inherit", "inherit"] }),
  spawn("pnpm", ["run", "dev:web"], { stdio: ["ignore", "inherit", "inherit"] }),
];

console.log("[dev] API server (3001) va Web dev server (3000) ishga tushmoqda...");

function shutdown() {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const child of children) child.on("exit", () => shutdown());
