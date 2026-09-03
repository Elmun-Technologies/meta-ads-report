/**
 * Google Ads OAuth 2.0 — refresh token olish vositasi.
 *
 * Ishlatish:
 *   1) GOOGLE_ADS_CLIENT_ID va GOOGLE_ADS_CLIENT_SECRET ni .env da bering
 *      (docs/google-ads-api-setup.md — 1-qadam).
 *   2) `pnpm google:oauth` → brauzerda ochiladigan avtorizatsiya havolasi chiqadi.
 *   3) Google hisobingizda ruxsat bering → sahifa redirect_uri ga o'tadi.
 *   4) URL dan `code=` qiymatini ko'chiring va:
 *      `pnpm google:oauth --code=<CODE>` deb bering → refresh token chop etiladi.
 *
 * Muhim: refresh token — maxfiy. Uni .env / Vercel Secrets da saqlang, git'ga
 * qo'ymang.
 */
import process from "node:process";

const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI || "http://localhost";

function fail(msg: string): never {
  console.error(`\nXato: ${msg}\n`);
  process.exit(1);
}

async function main() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    fail("GOOGLE_ADS_CLIENT_ID va GOOGLE_ADS_CLIENT_SECRET .env da bo'lishi kerak.");

  const codeIdx = process.argv.findIndex(a => a.startsWith("--code="));
  const code = codeIdx >= 0 ? process.argv[codeIdx].slice("--code=".length) : null;

  if (!code) {
    const url =
      "https://accounts.google.com/o/oauth2/v2/auth" +
      "?client_id=" + encodeURIComponent(clientId) +
      "&redirect_uri=" + encodeURIComponent(redirectUri) +
      "&response_type=code" +
      "&scope=" + encodeURIComponent("https://www.googleapis.com/auth/adwords") +
      "&access_type=offline" +
      "&prompt=consent";
    console.log("Avtorizatsiya uchun shu havolani brauzerda oching:\n");
    console.log(url);
    console.log(
      `\nRuxsat bergach sahifa ${redirectUri}?code=... ga o'tadi. ` +
        "URL dagi code qiymatini olib:\n  pnpm google:oauth --code=<CODE>"
    );
    return;
  }

  // Code → refresh_token
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    process.exit(1);
  }
  const data = JSON.parse(text) as { refresh_token?: string; access_token?: string };
  if (!data.refresh_token) {
    console.error(
      "\nJavobda refresh_token yo'q. Buning uchun OAuth consent screen da " +
        "Google Ads hisobini 'test user' qilib qo'shgan bo'lishingiz va scope 'adwords' " +
        "berilgan bo'lishi kerak. Qayta urinib ko'ring.\n"
    );
    process.exit(1);
  }
  console.log("\n=== REFRESH TOKEN (maxfiy, faqat sizda saqlansin) ===\n");
  console.log(data.refresh_token);
  console.log("\n=====================================================\n");
  console.log(
    "Buni .env faylida GOOGLE_ADS_REFRESH_TOKEN ga qo'ying yoki Vercel Secrets ga saqlang."
  );
}

void main();
