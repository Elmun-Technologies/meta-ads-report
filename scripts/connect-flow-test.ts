/**
 * Ulanish oqimi testi — «Ulanishlar» sahifasidagi barcha yo'llarni tekshiradi.
 *
 *   pnpm test:connect
 *
 * Nega mock: sandbox/CI'dan tashqi API'larga (graph.facebook.com, googleapis.com,
 * amocrm.ru, api.tgstat.ru) chiqish odatda bloklangan. Shuning uchun `fetch`
 * stub qilinadi — qolgan ZANJIR (route → oauthApps → connections store → sync
 * dvigateli → snapshot fayli → /api/connections payload) HAQIQIY kod bilan ishlaydi.
 *
 * Tekshiriladi:
 *   1. App kalitlari holati: nima yetishmayapti (maydon darajasida)
 *   2. Kalitlarni UI'dan saqlash → ready=true → OAuth start redirect qiladi
 *   3. Token bilan ulash: Meta / Google Ads / AmoCRM (+ darhol sync, snapshot fayli)
 *   4. Telegram (TGStat) tokeni: yaroqsiz token aniqlanadi, yaxshisi saqlanadi,
 *      kanal qo'shiladi, sync ishlaydi
 *   5. Eksport fayl yuklash: muvaffaqiyatli, noto'g'ri nom, path traversal,
 *      buzilgan format, bo'sh fayl, o'chirish
 *   6. Xato holatlari va ulanishni o'chirish
 *
 * Vaqtinchalik papka ishlatiladi (SNAPSHOTS_DIR) — repo fayllariga tegmaydi.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ads-connect-test-"));
fs.mkdirSync(path.join(TMP, "snapshots"), { recursive: true });
process.env.SNAPSHOTS_DIR = path.join(TMP, "snapshots");
process.env.PUBLIC_ORIGIN = "https://dash.example.com";
process.env.META_DAYS = "7";

/* ------------------------------------------------------------------ */
/* Mock: tashqi API'lar                                                */
/* ------------------------------------------------------------------ */

const realFetch = globalThis.fetch;
const externalCalls: string[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const META_CAMPAIGN = {
  campaign_id: "238001",
  campaign_name: "Test kampaniya",
  objective: "OUTCOME_LEADS",
  spend: "123.45",
  impressions: "5000",
  clicks: "250",
  reach: "4200",
  frequency: "1.19",
  cpc: "0.49",
  cpm: "24.69",
  inline_link_clicks: "200",
  inline_link_click_ctr: "4",
  actions: [
    { action_type: "link_click", value: "200" },
    { action_type: "offsite_conversion.fb_pixel_lead", value: "12" },
  ],
};

globalThis.fetch = (async (input: any, init?: any) => {
  const url: string = typeof input === "string" ? input : String(input?.url ?? input);
  // O'z serverimizga qilingan so'rovlar haqiqiy fetch orqali ketadi
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return realFetch(input, init);
  externalCalls.push(url.replace(/(access_token|token)=[^&]+/, "$1=***").slice(0, 140));

  /* ---- Meta Graph ---- */
  if (url.includes("graph.facebook.com")) {
    if (url.includes("access_token=EAABad")) return json({ error: { message: "Invalid OAuth access token" } }, 400);
    if (url.includes("/me/adaccounts"))
      return json({
        data: [
          { account_id: "111", name: "Kabinet A", currency: "USD" },
          { account_id: "222", name: "Kabinet B", currency: "EUR" },
        ],
      });
    if (url.includes("/me?")) return json({ name: "Test Foydalanuvchi" });
    if (/\/act_\d+\?/.test(url)) return json({ name: "Kabinet A", currency: "USD", account_id: "111" });
    if (url.includes("/insights")) {
      if (url.includes("breakdowns=age"))
        return json({ data: [{ age: "18-24", spend: "60", impressions: "2500", clicks: "120", reach: "2100", actions: META_CAMPAIGN.actions }] });
      if (url.includes("time_increment=1"))
        return json({ data: [{ date_start: "2026-09-10", spend: "60", impressions: "2500", clicks: "120", actions: META_CAMPAIGN.actions }] });
      if (url.includes("level=ad"))
        return json({ data: [{ ad_id: "1", ad_name: "Reklama 1", campaign_id: "238001", adset_id: "11", adset_name: "Adset 1", spend: "123.45", impressions: "5000", clicks: "250", reach: "4200", actions: META_CAMPAIGN.actions }] });
      return json({ data: [META_CAMPAIGN] });
    }
    if (url.includes("/ads?"))
      return json({ data: [{ id: "1", name: "Reklama 1", status: "ACTIVE", effective_status: "ACTIVE", created_time: "2026-09-01T00:00:00+0000" }] });
    return json({ data: [] });
  }

  /* ---- Google ---- */
  if (url.includes("oauth2.googleapis.com/token")) {
    if (String(init?.body ?? "").includes("refresh_token=1%2F%2Fbad") || String(init?.body ?? "").includes("1//bad"))
      return json({ error: "invalid_grant", error_description: "Bad Request" }, 400);
    return json({ access_token: "ya.mock-access", refresh_token: "1//mock-refresh", expires_in: 3600 });
  }
  if (url.includes("listAccessibleCustomers"))
    return json({ resourceNames: ["customers/1234567890", "customers/0987654321"] });
  if (url.includes("googleads.googleapis.com"))
    return json([
      {
        campaign: { id: 1, name: "G kampaniya", status: "ENABLED" },
        metrics: { costMicros: "1000000", impressions: "1000", clicks: "20", conversions: 1.0 },
      },
    ]);

  /* ---- AmoCRM ---- */
  if (url.includes("amocrm.ru")) {
    if (url.includes("badsub")) return json({ detail: "Account not found" }, 404);
    if (url.includes("/api/v4/account")) return json({ name: "Test MCHJ", subdomain: "testsub" });
    if (url.includes("/leads/pipelines"))
      return json({
        _embedded: {
          pipelines: [
            {
              id: 1,
              name: "Sotuv",
              statuses: [
                { id: 10, name: "Yangi", sort: 1, type: 0 },
                { id: 11, name: "Yakun", sort: 2, type: 1 },
              ],
            },
          ],
        },
      });
    if (url.includes("/api/v4/leads"))
      return json({
        _embedded: {
          leads: [
            {
              id: 5001,
              name: "Jasur",
              created_at: 1757000000,
              updated_at: 1757000000,
              status_id: 10,
              pipeline_id: 1,
              price: 1500000,
              responsible_user_id: 7,
              custom_fields_values: [{ field_name: "UTM campaign", values: [{ value: "fb_lead" }] }],
              _embedded: { contacts: [{ id: 9001 }] },
            },
          ],
        },
      });
    if (url.includes("/api/v4/contacts"))
      return json({
        _embedded: {
          contacts: [
            { id: 9001, name: "Jasur", custom_fields_values: [{ field_code: "PHONE", values: [{ value: "+998901234567" }] }] },
          ],
        },
      });
    return json({});
  }

  /* ---- TGStat ---- */
  if (url.includes("api.tgstat.ru")) {
    if (url.includes("/usage/stat")) {
      if (url.includes("token=BADTOKEN")) return json({ status: "error", error: "wrong token" });
      return json({
        status: "ok",
        response: [
          {
            serviceKey: "api_stat_l",
            title: "Stat API (tarif L)",
            spentRequests: "12/250000",
            expiredAt: Math.floor(Date.now() / 1000) + 86400 * 30,
          },
        ],
      });
    }
    if (url.includes("/channels/stat"))
      return json({
        status: "ok",
        response: {
          id: 42,
          title: "Test Kanal",
          username: "testkanal",
          participants_count: 12000,
          avg_post_reach: 3400,
          adv_post_reach_12h: 1200,
          adv_post_reach_24h: 2000,
          adv_post_reach_48h: 2600,
          err_percent: 28.3,
          daily_reach: 5000,
          forwards_count: 12,
          mentions_count: 3,
          posts_count: 240,
        },
      });
    if (url.includes("/channels/posts"))
      return json({
        status: "ok",
        response: {
          items: [
            {
              id: 900,
              date: Math.floor(Date.now() / 1000) - 86400,
              views: 4100,
              link: "https://t.me/testkanal/900",
              channel_id: 42,
              forwarded_from: null,
              is_deleted: false,
              text: "Reklama posti",
              forwards: 5,
              reactions: 33,
              comments_count: 7,
            },
          ],
        },
      });
    return json({ status: "ok", response: {} });
  }

  return json({ error: `mock yo'q: ${url}` }, 404);
}) as typeof fetch;

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

const { createApp } = await import("../server/app.ts");
const server = createApp("server").listen(0);
await new Promise(r => server.once("listening", r));
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;

const req = async (method: string, url: string, body?: unknown) => {
  // redirect: "manual" — OAuth start 302 beradi, undici aks holda tashqi
  // provayderga (facebook.com) o'tib ketadi va sandbox'da uziladi
  const res = await realFetch(`${base}${url}`, {
    method,
    redirect: "manual",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json().catch(() => ({})) : await res.text();
  return { status: res.status, headers: res.headers, data: data as any };
};
const post = (url: string, body?: unknown) => req("POST", url, body ?? {});
const get = (url: string) => req("GET", url);
const del = (url: string) => req("DELETE", url);

const results: string[] = [];
let failures = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  if (!ok) failures++;
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${extra !== undefined && !ok ? ` — ${JSON.stringify(extra)}` : ""}`);
}

/* ------------------------------------------------------------------ */

// 1) Boshlang'ich holat — hech narsa sozlanmagan
const before = (await get("/api/oauth/apps")).data.platforms;
check("1.1 Meta: kalit yo'q, yetishmayotgan maydonlar ko'rsatilgan", before.meta.ready === false && before.meta.missing.length === 2, before.meta);
check("1.2 Google: kalit yo'q", before["google-ads"].ready === false && before["google-ads"].missing.length === 3);
check("1.3 AmoCRM: kalit yo'q", before.amocrm.ready === false);
check("1.4 Telegram: token yo'q", before.telegram.ready === false && before.telegram.manual === false);

// 2) App kalitlarini UI'dan saqlash
const savedMeta = await post("/api/oauth/apps/meta", { appId: "1234567890", appSecret: "supersecretvalue123" });
check("2.1 Meta kalitlari saqlandi → ready", savedMeta.data.ready === true, savedMeta.data);
check("2.2 Maxfiy qiymat niqoblangan qaytadi", String(savedMeta.data.status.values.appSecret).includes("•"), savedMeta.data.status?.values);
check("2.3 Manba: store (UI'dan)", savedMeta.data.status.source === "store");
const partial = await post("/api/oauth/apps/google-ads", { clientId: "only-id" });
check("2.4 Partial saqlash: hali ready emas", partial.data.ready === false && partial.data.status.missing.length === 2, partial.data);

// 3) OAuth start — kalitlar bilan redirect
const startRes = await req("GET", "/api/oauth/meta/start");
check("3.1 /meta/start → 302 Facebook", startRes.status === 302 && String(startRes.headers.get("location")).includes("facebook.com"), startRes.status);
check("3.2 redirect_uri = PUBLIC_ORIGIN", String(startRes.headers.get("location")).includes("https%3A%2F%2Fdash.example.com%2Fapi%2Foauth%2Fmeta%2Fcallback"));
const startBad = await req("GET", "/api/oauth/amocrm/start");
check("3.3 kalitsiz /amocrm/start → 400 + tushunarli sahifa", startBad.status === 400 && String(startBad.data).includes("AMOCRM_CLIENT_ID"));

// 4) Token bilan ulash — Meta
const metaToken = await post("/api/oauth/meta/token", { accessToken: "EAABgoodtoken" });
check("4.1 Meta token ulandi", metaToken.data.ok === true && metaToken.data.accounts.length === 2, metaToken.data);
const metaBad = await post("/api/oauth/meta/token", { accessToken: "EAABad" });
check("4.2 Yaroqsiz Meta token → 400 + aniq xato", metaBad.status === 400 && /Invalid OAuth/i.test(String(metaBad.data.error)), metaBad.data);
const metaEmpty = await post("/api/oauth/meta/token", { accessToken: "   " });
check("4.3 Bo'sh token → 400", metaEmpty.status === 400);
const metaOne = await post("/api/oauth/meta/token", { accessToken: "EAABgoodtoken", adAccountId: "act_222" });
check("4.4 Aniq kabinet so'ralsa — faqat o'sha ulanadi", metaOne.data.accounts?.length === 1 && metaOne.data.accounts[0].id === "222", metaOne.data.accounts);
check("4.5 Qayta ulanganda kartalar ko'paymadi (dedupe)", (await get("/api/oauth/accounts")).data.connections.filter((c: any) => c.platform === "meta").length === 1);

// 5) Token bilan ulash — Google Ads
//    (Tartib muhim: app kalitlari HALI store'da yo'q — avval shu holat tekshiriladi)
const googleNoClient = await post("/api/oauth/google-ads/token", { refreshToken: "1//user-refresh" });
check("5.1 Client id/secret bo'lmasa → tushunarli xato (400)", googleNoClient.status === 400 && /Client ID/i.test(String(googleNoClient.data.error)), googleNoClient.data);
const googleBad = await post("/api/oauth/google-ads/token", { refreshToken: "1//bad", clientId: "x", clientSecret: "y" });
check("5.2 Yaroqsiz refresh token → 400", googleBad.status === 400, googleBad.data);
const googleToken = await post("/api/oauth/google-ads/token", {
  refreshToken: "1//user-refresh",
  clientId: "mock-client.apps.googleusercontent.com",
  clientSecret: "mock-secret",
  developerToken: "mock-dev-token",
});
check("5.3 Google ulandi (2 kabinet topildi)", googleToken.data.ok === true && googleToken.data.accounts.length === 2, googleToken.data);
check("5.4 Client kalitlari avtomatik saqlandi → ready", (await get("/api/oauth/apps")).data.platforms["google-ads"].ready === true);

// 6) Token bilan ulash — AmoCRM
const amoToken = await post("/api/oauth/amocrm/token", { subdomain: "testsub.amocrm.ru", accessToken: "amo-mock-token" });
check("6.1 AmoCRM ulandi (subdomain tozalandi)", amoToken.data.ok === true && amoToken.data.label === "testsub.amocrm.ru", amoToken.data);
const amoBad = await post("/api/oauth/amocrm/token", { subdomain: "badsub", accessToken: "x" });
check("6.2 Yaroqsiz subdomain/token → 400", amoBad.status === 400, amoBad.data);
const amoNoSub = await post("/api/oauth/amocrm/token", { accessToken: "x" });
check("6.3 Subdomainsiz → 400", amoNoSub.status === 400);

// 7) Ulanishdan keyin DARHOL sync (snapshot fayllari yozildi)
await new Promise(r => setTimeout(r, 3500));
const written = fs.readdirSync(path.join(TMP, "snapshots")).sort();
check("7.1 Meta snapshot yozildi", written.some(f => f.startsWith("meta_act-222")), written);
check("7.2 Google snapshot yozildi", written.some(f => f.startsWith("google_1234567890")), written);
check("7.3 AmoCRM snapshot yozildi", written.some(f => f.startsWith("amo_testsub")), written);
const syncMeta = await post("/api/oauth/sync/meta");
check("7.4 Qo'lda sync (meta) → ok", syncMeta.data.ok === true, syncMeta.data.result);
const syncAmo = await post("/api/oauth/sync/amocrm");
check("7.5 Qo'lda sync (amocrm) → lead tortildi", syncAmo.data.ok === true && /lead/.test(String(syncAmo.data.result?.message)), syncAmo.data.result);

// 8) Telegram (TGStat) tokeni
const tgBad = await post("/api/oauth/apps/telegram", { token: "BADTOKEN" });
check("8.1 Yaroqsiz TGStat token aniqlanadi", tgBad.data.probe?.state === "invalid", tgBad.data.probe);
const tgGood = await post("/api/oauth/apps/telegram", { token: "6d15f8ff6b9b9b134457c4aed9c2f7cb" });
check("8.2 Yaxshi token tasdiqlandi (tarif ko'rsatildi)", tgGood.data.probe?.state === "ok" && /tarif/i.test(String(tgGood.data.probe?.message)), tgGood.data.probe);
check("8.3 Token niqoblangan holda qaytadi", String(tgGood.data.status.values.token).includes("•"));
const tgChannel = await post("/api/telegram/channels", { username: "testkanal" });
check("8.4 Kanal qo'shildi (statistika bilan)", tgChannel.data.channel?.subscribers === 12000 && tgChannel.data.channel?.posts?.length === 1, tgChannel.data);
const tgSync = await post("/api/oauth/sync/telegram");
check("8.5 Telegram sync ishlaydi", tgSync.data.ok === true, tgSync.data.result);
check("8.6 configured.telegram = true", (await get("/api/sync")).data.configured.telegram === true);
check("8.7 /api/telegram/channels → hasToken", (await get("/api/telegram/channels")).data.hasToken === true);

// 9) Eksport fayl yuklash
const yandexDoc = {
  account: { name: "demo-login", currency: "RUB" },
  period: "2026-09-01 — 2026-09-15",
  campaigns: [
    { Id: 1, Name: "Yandex kampaniya 1", Spend: 1200.5, Impressions: 4000, Clicks: 88, Conversions: 6 },
    { Id: 2, Name: "Yandex kampaniya 2", Spend: 400, Impressions: 1200, Clicks: 22, Conversions: 1 },
  ],
};
const up = await post("/api/snapshots", { name: "yandex_demo-login_2026-09.json", content: yandexDoc });
check("9.1 Yandex eksporti yuklandi", up.data.ok === true && up.data.summary.campaigns === 2, up.data);
const upStr = await post("/api/snapshots", {
  name: "amo_demo_2026-09.json",
  content: JSON.stringify({
    account: { name: "Demo CRM", subdomain: "demo", currency: "UZS" },
    pipelines: [{ id: 1, name: "Savdo" }],
    stages: [{ id: 101, name: "Yangi", pipeline_id: 1, sort: 1 }],
    leads: [{ id: 1, name: "Lead", created_at: "2026-09-05T10:00:00+05:00", updated_at: "2026-09-05T10:00:00+05:00", stage_id: 101, price: 100, history: [] }],
  }),
});
check("9.2 Satr ko'rinishidagi JSON ham qabul qilindi (AmoCRM)", upStr.data.ok === true && upStr.data.summary.leads === 1, upStr.data);
check("9.3 Noto'g'ri nom (prefikssiz) rad etildi", (await post("/api/snapshots", { name: "hisobot.json", content: yandexDoc })).status === 400);
check("9.4 Path traversal rad etildi", (await post("/api/snapshots", { name: "../../etc/passwd.json", content: yandexDoc })).status === 400);
check("9.5 Buzilgan format rad etildi", (await post("/api/snapshots", { name: "yandex_buzilgan.json", content: { foo: [{ bar: 1 }] } })).status === 400);
check("9.6 JSON bo'lmagan matn rad etildi", (await post("/api/snapshots", { name: "meta_x.json", content: "bu json emas" })).status === 400);
check("9.7 Bo'sh AmoCRM fayli rad etildi", (await post("/api/snapshots", { name: "amo_bosh.json", content: { leads: [] } })).status === 400);
const allFiles = await get("/api/snapshots/all");
check("9.8 Fayllar ro'yxati (writable + kind)", allFiles.data.writable === true && allFiles.data.files.some((f: any) => f.file === "amo_demo_2026-09.json" && f.kind === "crm"), allFiles.data.files);
check("9.9 Fayl o'chirildi", (await del("/api/snapshots/yandex_demo-login_2026-09.json")).data.ok === true);
check("9.10 Yo'q fayl → 404", (await del("/api/snapshots/yandex_yoq.json")).status === 404);
check("9.11 Yuklangan fayl diskda yo'q (o'chirildi)", !fs.existsSync(path.join(TMP, "snapshots", "yandex_demo-login_2026-09.json")));

// 10) /api/connections — UI ko'radigan payload
const conns = (await get("/api/connections")).data as any[];
const metaConn = conns.find(c => c.id === "meta");
check("10.1 Meta: ulangan + OAuth holati to'liq", metaConn.status === "connected" && metaConn.oauth.ready === true && metaConn.oauth.connections.length === 1, metaConn?.oauth);
check("10.2 Ulanish methodi ko'rinadi (token)", metaConn.oauth.connections[0].method === "token");
check("10.3 OAuth bo'lmagan platformada oauth maydoni yo'q", !conns.find(c => c.id === "yandex-direct")?.oauth);

// 11) Kabinet toggle + ulanishni o'chirish
const connId = metaConn.oauth.connections[0].id;
const accId = metaConn.oauth.connections[0].accounts[0].id;
const toggled = await post(`/api/oauth/accounts/${connId}/${accId}/toggle`);
check("11.1 Kabinet o'chirildi/yoqildi", toggled.status === 200 && typeof toggled.data.account.enabled === "boolean", toggled.data);
check("11.2 Noma'lum kabinet → 404", (await post(`/api/oauth/accounts/${connId}/nope/toggle`)).status === 404);
const removed = await del(`/api/oauth/connections/${connId}`);
check("11.3 Ulanish o'chirildi", removed.data.ok === true);
check("11.4 Noma'lum manba → 404", (await post("/api/oauth/apps/yandex", {})).status === 404);

// 12) Kalitlar diskda qoldi (store.json)
await new Promise(r => setTimeout(r, 500));
const store = JSON.parse(fs.readFileSync(path.join(TMP, "store.json"), "utf-8"));
check("12.1 oauthApps store.json da", Boolean(store.oauthApps?.meta?.appId) && Boolean(store.oauthApps?.telegram?.token), store.oauthApps);
check("12.2 Tokenlar store'da, lekin client payload'ida yo'q", JSON.stringify(conns).length > 0 && !JSON.stringify(conns).includes("EAABgoodtoken"));

/* ------------------------------------------------------------------ */

console.log(results.join("\n"));
console.log(`\n${results.length - failures}/${results.length} tekshiruv o'tdi${failures ? ` — ${failures} XATO` : " ✓"}`);
console.log(`Tashqi API chaqiruvlari: ${externalCalls.length} (barchasi mock orqali)`);

fs.rmSync(TMP, { recursive: true, force: true });
server.close();
process.exit(failures > 0 ? 1 : 0);
