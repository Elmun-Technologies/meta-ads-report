/**
 * Vaqtinchalik smoke-test: jsdom ichida barcha sahifalarni render qilib,
 * runtime xatolarni ushlaydi. Ishlatish: pnpm exec tsx scripts/smoke-render.ts
 */
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!doctype html><html><body><div id='root'></div></body></html>",
  {
    url: "http://localhost/",
    pretendToBeVisual: true,
  }
);
const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
g.dispatchEvent = dom.window.dispatchEvent.bind(dom.window);
g.addEventListener = dom.window.addEventListener.bind(dom.window);
g.removeEventListener = dom.window.removeEventListener.bind(dom.window);
g.Event = dom.window.Event;
g.location = dom.window.location;
(dom.window as any).matchMedia =
  (dom.window as any).matchMedia ||
  ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }));
g.localStorage = dom.window.localStorage;
g.history = dom.window.history;
g.CustomEvent = dom.window.CustomEvent;
g.PopStateEvent = dom.window.PopStateEvent;
g.requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 8) as any;
g.cancelAnimationFrame = (id: any) => clearTimeout(id);
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g.EventSource = class {
  constructor(_url: string) {}
  addEventListener() {}
  close() {}
  onopen: any = null;
  onerror: any = null;
};

const { normalizeMetaExport } = await import("../shared/normalize");
const { normalizeAmoExport, matchLeadsToAds } = await import("../shared/amo");
const raw = JSON.parse(
  fs.readFileSync(
    path.resolve(
      import.meta.dirname,
      "../server/data/snapshots/meta_act-1883723989171211_august-2026.json"
    ),
    "utf8"
  )
);
const snapshot = normalizeMetaExport(raw, {
  syncedAt: new Date().toISOString(),
  sourceLabel: "smoke-test",
});

// AmoCRM fixture — real kampaniya IDlariga bog'langan leadlar
const amoRaw = {
  account: { name: "Sof-Expo AmoCRM", subdomain: "sofexpo", currency: "UZS" },
  pipelines: [{ id: 1, name: "Savdo" }],
  stages: [
    { id: 101, name: "Yangi lead", pipeline_id: 1, sort: 1 },
    { id: 102, name: "Sifatli lead", pipeline_id: 1, sort: 2 },
    { id: 103, name: "Muzokara", pipeline_id: 1, sort: 3 },
    {
      id: 104,
      name: "Muvaffaqiyatli",
      pipeline_id: 1,
      sort: 4,
      status: { kind: "won" },
    },
    {
      id: 105,
      name: "Yopilgan",
      pipeline_id: 1,
      sort: 5,
      status: { kind: "lost" },
    },
  ],
  leads: [
    {
      id: 90001,
      name: "OOO Chorrak",
      created_at: "2026-08-05T10:12:00+05:00",
      updated_at: "2026-08-14T09:00:00+05:00",
      stage_id: 104,
      price: 12000000,
      responsible: "Nazir",
      contact: { name: "Alisher", phone: "+998901234567" },
      utm: {
        utm_source: "facebook",
        utm_campaign: "6939006462536",
        utm_content: "creative#1",
      },
      history: [{ at: "2026-08-05T10:12:00+05:00", stage: "Yangi lead" }],
      loss_reason: null,
    },
    {
      id: 90002,
      name: "Chaykhona Prime",
      created_at: "2026-08-06T11:00:00+05:00",
      updated_at: "2026-08-20T16:00:00+05:00",
      stage_id: 104,
      price: 8500000,
      responsible: "Nazir",
      contact: { name: "Dilshod" },
      utm: { utm_campaign: "52529634958940" },
      history: [],
      loss_reason: null,
    },
    {
      id: 90003,
      name: "Kafe Baraka",
      created_at: "2026-08-07T09:30:00+05:00",
      updated_at: "2026-08-18T12:00:00+05:00",
      stage_id: 105,
      price: 3000000,
      responsible: "Sardor",
      contact: { name: "Jahon" },
      utm: { utm_campaign: "6930088563936" },
      history: [],
      loss_reason: "Byudjet yo'q",
    },
    {
      id: 90004,
      name: "Bakery Sweet",
      created_at: "2026-08-09T14:20:00+05:00",
      updated_at: "2026-08-25T10:00:00+05:00",
      stage_id: 102,
      price: 5000000,
      responsible: "Nazir",
      contact: { name: "Malika" },
      utm: {},
      history: [],
      loss_reason: null,
    },
    {
      id: 90005,
      name: "Food Delivery UZ",
      created_at: "2026-08-10T08:00:00+05:00",
      updated_at: "2026-08-24T18:00:00+05:00",
      stage_id: 103,
      price: 15000000,
      responsible: "Sardor",
      contact: { name: "Rustam" },
      utm: { utm_campaign: "Foodera Lead | Broad" },
      history: [],
      loss_reason: null,
    },
  ],
};
const crm = matchLeadsToAds(
  normalizeAmoExport(amoRaw, { syncedAt: new Date().toISOString() }),
  snapshot
);
if (crm.matchedLeads < 3) {
  console.log("AMO MATCH KUCHI PAST: matched =", crm.matchedLeads);
  process.exitCode = 1;
}

const connections = [
  {
    id: "meta",
    name: "Meta Ads",
    vendor: "Facebook / Instagram",
    kind: "ads",
    status: "connected",
    accounts: [{ id: "act_1", name: "Sof-Expo l Nazir", currency: "USD" }],
    syncedAt: new Date().toISOString(),
    note: "test",
  },
  {
    id: "google-ads",
    name: "Google Ads",
    vendor: "Google",
    kind: "ads",
    status: "ready",
    accounts: [],
    syncedAt: null,
    note: "test",
  },
  {
    id: "yandex-direct",
    name: "Yandex Direct",
    vendor: "Yandex",
    kind: "ads",
    status: "ready",
    accounts: [],
    syncedAt: null,
    note: "test",
  },
  {
    id: "amocrm",
    name: "AmoCRM",
    vendor: "amoCRM",
    kind: "crm",
    status: "connected",
    accounts: [{ id: "sofexpo", name: "Sof-Expo AmoCRM", currency: "UZS" }],
    syncedAt: new Date().toISOString(),
    note: "test",
  },
];

g.fetch = async (url: string) => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/json" },
  json: async () => {
    const u = String(url);
    if (u.includes("connections")) return connections;
    if (u.includes("/api/crm")) return { connected: true, ...crm };
    if (u.includes("/api/snapshots"))
      return [
        {
          file: "meta_test_august.json",
          platform: "meta",
          accountName: "Sof-Expo l Nazir",
          periodLabel: "2026-08-01 — 2026-08-31",
          syncedAt: new Date().toISOString(),
        },
      ];
    return snapshot;
  },
  text: async () => "",
});

const errors: string[] = [];
const origError = console.error;
console.error = (...args: any[]) => {
  errors.push(args.map(String).join(" "));
};

const React = await import("react");
const { createRoot } = await import("react-dom/client");
// tsx classic JSX runtime ishlatadi (tsconfig jsx: preserve) — global React kerak
g.React = React;
const { default: App } = await import("../client/src/App");

const root = createRoot(document.getElementById("root")!);
root.render(React.createElement(App));

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
await sleep(1200);

const results: string[] = [];
function check(label: string, ok: boolean) {
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
}

const bodyText = () => (document.body.textContent || "").replace(/\s+/g, " ");

const overview = bodyText();
check("Overview sarlavha", overview.includes("Umumiy natijalar"));
check("Overview KPI (murojaat narxi)", overview.includes("Murojaat narxi"));
check("Overview xulosa", overview.includes("Raqamlar nima deyapti"));
check(
  "Overview funnel",
  /Ko.rsatuvlar/.test(overview) && /Sahifaga o.tish/.test(overview)
);
check("Overview diqqat paneli", overview.includes("Diqqat"));
check("Overview pacing", overview.includes("prognoz"));
check(
  "Overview CRM strip",
  overview.includes("AmoCRM") && overview.includes("Qaytim")
);
check(
  "Overview interaksiya+video",
  overview.includes("Qiziqish reytingi") &&
    overview.includes("Video va yozishmalar")
);

const routes: [string, string[], string][] = [
  ["/campaigns", ["Batafsil jadval", "Kampaniyalar"], ["FOODERA"]],
  ["/creatives", ["Reyting", "Kreativlar"], ["Bosish ulushi"]],
  ["/audience", ["Qaysi yosh javob berayapti"], ["18-24"]],
  ["/leads", ["Kampaniya tuzilmasi"], ["PROMOTORS"]],
  ["/pipeline", ["Murojaatdan bitimgacha", "Doska"], ["OOO Chorrak", "Qaytim"]],
  ["/compare", ["Nima o\'zgardi?", "Yo\'nalishlar taqqoslash"], ["FOODERA"]],
  ["/report", ["Rahbariyat uchun", "Chop etish"], ["murojaatgacha"]],
  ["/connections", ["Ulanishlar"], ["Google Ads"]],
  ["/not-exist", ["404"], []],
];

for (const [route, labels, extras] of routes) {
  dom.window.history.pushState({}, "", route);
  dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
  await sleep(700);
  const text = bodyText();
  for (const label of labels)
    check(`${route} → "${label}"`, text.includes(label));
  for (const extra of extras)
    check(`${route} → "${extra}"`, text.includes(extra));
}

// Drawer ochilishini tekshirish (kampaniya id topib, click emas — context orqali emas, oddiy tr click)
dom.window.history.pushState({}, "", "/campaigns");
dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
await sleep(600);
const row = document.querySelector(".tbl tbody tr") as HTMLElement | null;
if (row) {
  row.click();
  await sleep(400);
  const text = bodyText();
  check(
    "Drawer ochildi (kampaniya tafsilotlari)",
    text.includes("Kampaniya tafsilotlari")
  );
  const closeBtn = Array.from(document.querySelectorAll("button")).find(b =>
    (b.textContent || "").includes("Yopish")
  ) as HTMLElement | undefined;
  closeBtn?.click();
  await sleep(300);
}

// Command palette
const kbdEvent = new dom.window.KeyboardEvent("keydown", {
  key: "k",
  metaKey: true,
  bubbles: true,
});
dom.window.dispatchEvent(kbdEvent);
await sleep(300);
check("Command palette (⌘K)", Boolean(document.querySelector(".cmdk")));
const paletteText = bodyText();
check(
  "Palette itemlar",
  paletteText.includes("Sahifalar") || paletteText.includes("Kampaniyalar")
);

console.error = origError;
console.log(results.join("\n"));
const reactErrors = errors.filter(e => !e.includes("Warning:"));
if (reactErrors.length) {
  console.log("\nRUNTIME ERRORS:\n" + reactErrors.slice(0, 10).join("\n---\n"));
  process.exitCode = 1;
} else {
  console.log("\nRuntime xatolar yo'q ✓");
}
process.exit(process.exitCode || 0);
