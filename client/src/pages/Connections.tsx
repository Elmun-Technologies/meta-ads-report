import { ArrowUpRight, Check, FolderOpen, Radio, RefreshCw, Zap } from "lucide-react";
import { PLATFORM_META } from "@shared/types";
import { dateLabel, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { Panel } from "@/components/widgets";

interface Step {
  t: string;
  code?: string;
}

interface Guide {
  id: string;
  name: string;
  logo: string;
  color: string;
  /** Qayerdan: aniq menyu yo'li */
  where: string;
  steps: Step[];
  verify: string;
}

const GUIDES: Guide[] = [
  {
    id: "amocrm",
    name: "AmoCRM",
    logo: "A",
    color: "#8b5cf6",
    where: "amoCRM hisobi → Sozlamalar (⚙) → Integratsiyalar → API kalitlari",
    steps: [
      {
        t: "Yangi integratsiya yarating va API kalitini oling — ruxsatlar: Leads (o‘qish) + Contacts (o‘qish).",
      },
      {
        t: "Leadlarni quyidagi maydonlar bilan eksport qiling:",
        code: "id · name · created_at · stage_id · price · responsible · contact · utm_campaign · history",
      },
      {
        t: "Real-time rejim (tavsiya): AmoCRM → Sozlamalar → Integratsiyalar → Webhook'lar ga quyidagi URL'ni bog'lang (leads.add / leads.status / leads.update):",
        code: "https://<sizingiz>/api/webhooks/amocrm",
      },
      {
        t: "Yoki faylni nomlab, snapshot papkasiga tashlang:",
        code: "server/data/snapshots/amo_<hisob>_<davr>.json",
      },
      {
        t: "Meta’da UTM shabloni yoqilganligini tekshiring — bo‘lmasa leadlar kampaniyaga bog‘lanmaydi:",
        code: "utm_source=facebook&utm_campaign={{campaign.id}}&utm_content={{ad.id}}",
      },
    ],
    verify:
      "«Murojaat yo‘li» (/pipeline) sahifasi o‘zi ochiladi — chap paneldagi AmoCRM «Ulangan»ga o‘tadi.",
  },
  {
    id: "meta",
    name: "Meta Ads",
    logo: "f",
    color: PLATFORM_META.meta.color,
    where: "Meta Business Suite → Ads Manager → Business Settings → Marketing API",
    steps: [
      {
        t: "Kabinetni oching va act_ identifikatorini oling (Ads Manager'dagi hisob raqami).",
      },
      {
        t: "Marketing API uchun access token oling — ruxsat: ads_read (yoki tayyor Meta Ads MCP serverini ishlating).",
      },
      {
        t: "Real-time rejim (tavsiya): .env ga token va kabinet ID sini yozing — sync dvigateli har 5 daqiqada o'zi tortadi:",
        code: "META_ACCESS_TOKEN=...\nMETA_AD_ACCOUNT_ID=act_...\nSYNC_INTERVAL_SEC=300",
      },
      {
        t: "Yoki MCP standart eksportini olib, faylni nomlab papkaga tashlang:",
        code: "account · summary · campaigns · age · ads · adInsights\n→ server/data/snapshots/meta_act-<id>_<davr>.json",
      },
    ],
    verify:
      "Tepadagi kabinet tanlagichda hisob nomi chiqadi; real-time rejimda «Jonli harakat» panelida har sync natijasi ko'rinadi.",
  },
  {
    id: "google-ads",
    name: "Google Ads",
    logo: "G",
    color: PLATFORM_META["google-ads"].color,
    where: "Google Ads → Asboblar (Tools) → API Center → Developer token",
    steps: [
      {
        t: "Google Ads hisobi va Developer tokenni tayyorlang (yoki tayyor Google Ads MCP serverini ishlating).",
      },
      {
        t: "Real-time rejim: .env ga GOOGLE_ADS_* kalitlarini yozing (qo'llanma: docs/google-ads-api-setup.md) — sync dvigateli o'zi tortadi.",
        code: "pnpm google:oauth   # refresh token olish\npnpm google:pull    # bir marta qo'lda tortish",
      },
      {
        t: "Yoki kampaniyalar kesimida eksport olib, faylni nomlab papkaga tashlang:",
        code: "campaign_id · campaign_name · cost_micros · impressions · clicks · conversions\n→ server/data/snapshots/google_<id>_<davr>.json",
      },
    ],
    verify:
      "Chap panelda Google Ads «Ulangan»ga o‘tadi — kampaniyalar umumiy KPI va jadvalda ko‘rinadi.",
  },
  {
    id: "telegram",
    name: "Telegram",
    logo: "TG",
    color: PLATFORM_META.telegram.color,
    where: "TGStat API — @channelname bo'yicha kanal statistikasi",
    steps: [
      {
        t: "TGStat'da token oling va .env ga yozing:",
        code: "TGSTAT_TOKEN=...",
      },
      {
        t: "«Telegram kanallar» sahifasida kanal @username ini kiriting — obunachilar, qamrov, postlar va reaksiyalar avtomatik yuklanadi.",
      },
      {
        t: "Har bir reklama postiga narx kiriting — Telegram sarfi umumiy hisobga qo'shiladi.",
      },
    ],
    verify:
      "«Telegram kanallar» (/telegram) sahifasi to'ladi; real-time rejimda har syncda statistika yangilanadi.",
  },
  {
    id: "yandex-direct",
    name: "Yandex Direct",
    logo: "Я",
    color: PLATFORM_META["yandex-direct"].color,
    where: "Yandex Direct → API (OAuth token) — yoki tayyor Direct MCP",
    steps: [
      {
        t: "Yandex Direct API tokenini oling.",
      },
      {
        t: "Kampaniyalar kesimida eksport oling:",
        code: "Id · Name · Spend · Impressions · Clicks · Conversions",
      },
      {
        t: "Faylni nomlab, snapshot papkasiga tashlang:",
        code: "server/data/snapshots/yandex_<login>_<davr>.json",
      },
    ],
    verify:
      "Chap panelda Yandex Direct «Ulangan»ga o‘tadi (RUB→USD konvertatsiya bilan).",
  },
];

export default function Connections() {
  const { connections, snapshot, live, syncNow, syncState, syncing } =
    useDashboardContext();

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker">Ulash qo‘llanmasi</span>
          <h1>Ulanishlar</h1>
          <p>
            Har bir platforma bitta narsa bilan ulanadi: uning eksport faylini{" "}
            <span className="mono">server/data/snapshots/</span> papkasiga
            tashlash. Pastda har bir manba uchun — qayerdan boshlash, qanday
            eksport olish va qanday nomlash — aniq qadamlar.
          </p>
        </div>
        <div className="right">
          <button
            className="primary-btn"
            onClick={() => void syncNow()}
            disabled={syncing}
          >
            <RefreshCw size={13} className={syncing ? "spin" : ""} /> Barcha manbalarni hoziroq yangilash
          </button>
        </div>
      </div>

      {/* Hozirgi holat */}
      <div className="conn-grid" style={{ marginBottom: 14 }}>
        {connections.map(conn => {
          const connected = conn.status === "connected";
          const isCrm = conn.kind === "crm";
          const pm = isCrm
            ? null
            : PLATFORM_META[conn.id as keyof typeof PLATFORM_META];
          return (
            <div
              className="conn-card"
              key={conn.id}
              style={
                connected
                  ? {
                      borderColor:
                        "color-mix(in srgb, var(--good) 40%, var(--line))",
                    }
                  : undefined
              }
            >
              <div className="c-head">
                <span
                  className="conn-logo"
                  style={{ background: isCrm ? "#8b5cf6" : (pm?.color ?? "var(--accent)") }}
                >
                  {conn.id === "meta"
                    ? "f"
                    : conn.id === "google-ads"
                      ? "G"
                      : conn.id === "yandex-direct"
                        ? "Я"
                        : "A"}
                </span>
                <div style={{ minWidth: 0 }}>
                  <b>{conn.name}</b>
                  <small>{conn.vendor}</small>
                </div>
                <span
                  className={`chip ${connected ? "good" : "muted"}`}
                  style={{ marginLeft: "auto", flex: "none" }}
                >
                  <i /> {connected ? "ULANGAN" : "KUTILYAPTI"}
                </span>
              </div>
              <div className="conn-kv">
                <span>{isCrm ? "Hisob" : "Kabinet"}</span>
                <b>
                  {conn.accounts.length
                    ? conn.accounts.map(a => a.name).join(", ")
                    : "—"}
                </b>
              </div>
              <div className="conn-kv">
                <span>Oxirgi sync</span>
                <b>{conn.syncedAt ? dateLabel(conn.syncedAt) : "—"}</b>
              </div>
              <div className="conn-kv">
                <span>Real-time kanal</span>
                <b>
                  {connected ? (live ? "SSE · faol" : "Polling · 30s") : "—"}
                </b>
              </div>
              {conn.autoSync && (
                <div className="conn-kv">
                  <span>Avtomatik tortish</span>
                  <b style={{ color: "var(--good)" }}>
                    <Zap size={11} style={{ display: "inline", marginRight: 4 }} />
                    har {Math.round((syncState?.intervalSec ?? 300) / 60)} daqiqada
                  </b>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Qanday ulash — bosqichma-bosqich */}
      <div className="grid-12">
        {GUIDES.map(guide => {
          const conn = connections.find(c => c.id === guide.id);
          const connected = conn?.status === "connected";
          return (
            <div className="col-6" key={guide.id}>
              <Panel
                kicker={`${guide.name} · ${connected ? "ulangan" : "ulash qadamlari"}`}
                title="Qanday ulanadi"
                style={{ height: "100%" }}
              >
                <div className="guide-where">
                  <FolderOpen size={13} style={{ flex: "none", color: guide.color }} />
                  <span>
                    Qayerdan: <b>{guide.where}</b>
                  </span>
                </div>
                <div className="step-grid">
                  {guide.steps.map((s, i) => (
                    <div className="step-row" key={i}>
                      <span
                        className="step-num"
                        style={{
                          background: `color-mix(in srgb, ${guide.color} 14%, transparent)`,
                          color: guide.color,
                        }}
                      >
                        {i + 1}
                      </span>
                      <div className="step-body">
                        {s.t}
                        {s.code && <code className="step-code">{s.code}</code>}
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  className="note-strip"
                  style={{ marginTop: 12, borderColor: "color-mix(in srgb, var(--good) 30%, var(--line))" }}
                >
                  <Check size={14} style={{ flex: "none", color: "var(--good)" }} />
                  <span>
                    <b>Tekshirish:</b> {guide.verify}
                  </span>
                </div>
              </Panel>
            </div>
          );
        })}
      </div>

      <Panel
        kicker="Umumiy qoida"
        title="Ma'lumot qanday oqadi"
        style={{ marginTop: 14 }}
      >
        <div className="d-kv">
          <span>Snapshot joyi</span>
          <b className="mono">server/data/snapshots/</b>
        </div>
        <div className="d-kv">
          <span>Live kanal</span>
          <b>/api/stream (SSE) + fs.watch + sync dvigateli</b>
        </div>
        <div className="d-kv">
          <span>Sync intervali</span>
          <b>har {Math.round((syncState?.intervalSec ?? 300) / 60)} daqiqa (SYNC_INTERVAL_SEC)</b>
        </div>
        <div className="d-kv">
          <span>Joriy manba</span>
          <b>{snapshot?.meta.sourceLabel ?? "—"}</b>
        </div>
        <div className="d-kv">
          <span>Kampaniyalar / kreativlar</span>
          <b>
            {whole(snapshot?.campaigns.length ?? 0)} /{" "}
            {whole(snapshot?.creatives.length ?? 0)}
          </b>
        </div>
        <div className="note-strip" style={{ marginTop: 12 }}>
          <span>
            <b>Real-time ikki yo'lda ishlaydi:</b> (1) sync dvigateli ulangan
            manbalardan (Meta/Google/Telegram API) har intervalda o'zi tortadi;
            (2) fayl papkaga tushsa <b>fs.watch</b> darhol sezadi — ikkalasida ham
            SSE orqali hamma ochiq dashboardga push boradi,{" "}
            <b>sahifani yangilash shart emas</b>. To‘liq JSON namunalari:{" "}
            <a
              className="panel-link"
              href="https://github.com/Elmun-Technologies/meta-ads-report/blob/main/server/data/README.md"
              target="_blank"
              rel="noreferrer"
            >
              server/data/README.md <ArrowUpRight size={11} />
            </a>
          </span>
        </div>
      </Panel>
    </>
  );
}
