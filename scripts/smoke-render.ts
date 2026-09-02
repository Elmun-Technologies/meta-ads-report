/**
 * Vaqtinchalik smoke-test: jsdom ichida barcha sahifalarni render qilib,
 * runtime xatolarni ushlaydi. Ishlatish: pnpm exec tsx scripts/smoke-render.ts
 */
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, "navigator", { value: dom.window.navigator, configurable: true });
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
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 8) as any;
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
const raw = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../server/data/snapshots/meta_act-1883723989171211_august-2026.json"), "utf8"));
const snapshot = normalizeMetaExport(raw, { syncedAt: new Date().toISOString(), sourceLabel: "smoke-test" });
const connections = [
  { id: "meta", name: "Meta Ads", vendor: "Facebook / Instagram", status: "connected", accounts: [{ id: "act_1", name: "Sof-Expo l Nazir", currency: "USD" }], syncedAt: new Date().toISOString(), note: "test" },
  { id: "google-ads", name: "Google Ads", vendor: "Google", status: "ready", accounts: [], syncedAt: null, note: "test" },
  { id: "yandex-direct", name: "Yandex Direct", vendor: "Yandex", status: "ready", accounts: [], syncedAt: null, note: "test" },
];

g.fetch = async (url: string) => ({
  ok: true,
  status: 200,
  json: async () => (String(url).includes("connections") ? connections : snapshot),
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
await sleep(1200);

const results: string[] = [];
function check(label: string, ok: boolean) {
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
}

const bodyText = () => (document.body.textContent || "").replace(/\s+/g, " ");

const overview = bodyText();
check("Overview sarlavha", overview.includes("Boshqaruv paneli"));
check("Overview KPI (CPL)", overview.includes("Cost per lead"));
check("Overview xulosa dvigateli", overview.includes("lead manbasi") || overview.includes("xulosa") || overview.includes("XULOSA"));
check("Overview funnel", overview.includes("Impressions") && overview.includes("Landing views"));
check("Overview signal markazi", overview.includes("SIGNAL MARKAZI"));
check("Overview pacing", overview.includes("BYUDJET SUR'ATI") && overview.includes("Pacing"));

const routes: [string, string[], string][] = [
  ["/campaigns", ["KAMPANIYA LEDGER", "Kampaniyalar"], ["FOODERA"]],
  ["/creatives", ["KREATIV REYTINGI", "Kreativlar"], ["CTR"]],
  ["/audience", ["AUDITORIYA TAHLILI"], ["18-24"]],
  ["/leads", ["LEAD FUNNEL EXPLORER", "Expo'dan kreativgacha"], ["PROMOTORS"]],
  ["/compare", ["TAQQOSLASH", "EXPO BENCHMARK"], ["FOODERA"]],
  ["/report", ["EXECUTIVE BRIEF", "Chop etish"], ["voronka", "VORONKA"]],
  ["/connections", ["Integratsiyalar"], ["Google Ads"]],
  ["/not-exist", ["404"], []],
];

for (const [route, labels, extras] of routes) {
  dom.window.history.pushState({}, "", route);
  dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
  await sleep(700);
  const text = bodyText();
  for (const label of labels) check(`${route} → "${label}"`, text.includes(label));
  for (const extra of extras) check(`${route} → "${extra}"`, text.includes(extra));
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
  check("Drawer ochildi (KAMPANIYA TAFSILOTI)", text.includes("TAFSILOTI"));
  const closeBtn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").includes("Yopish")) as HTMLElement | undefined;
  closeBtn?.click();
  await sleep(300);
}

// Command palette
const kbdEvent = new dom.window.KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
dom.window.dispatchEvent(kbdEvent);
await sleep(300);
check("Command palette (⌘K)", Boolean(document.querySelector(".cmdk")));
const paletteText = bodyText();
check("Palette itemlar", paletteText.includes("Sahifalar") || paletteText.includes("Kampaniyalar"));

console.error = origError;
console.log(results.join("\n"));
const reactErrors = errors.filter((e) => !e.includes("Warning:"));
if (reactErrors.length) {
  console.log("\nRUNTIME ERRORS:\n" + reactErrors.slice(0, 10).join("\n---\n"));
  process.exitCode = 1;
} else {
  console.log("\nRuntime xatolar yo'q ✓");
}
process.exit(process.exitCode || 0);
