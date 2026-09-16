import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  FolderOpen,
  Link2,
  Radio,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import { PLATFORM_META, type ConnectionInfo } from "@shared/types";
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

/* ------------------------------------------------------------------ */
/* OAuth — o'z hisoblaringizni "Ulash" tugmasi bilan bog'lash         */
/* ------------------------------------------------------------------ */

const OAUTH_PLATFORMS = [
  {
    id: "meta",
    name: "Facebook / Instagram",
    logo: "f",
    color: PLATFORM_META.meta.color,
    button: "Facebook bilan ulash",
    hint: "Barcha reklama kabinetlaringiz (aktlar) topiladi — xohlaganingizini yoqib/o'chirib qo'yasiz.",
  },
  {
    id: "google-ads",
    name: "Google Ads",
    logo: "G",
    color: PLATFORM_META["google-ads"].color,
    button: "Google bilan ulash",
    hint: "Google hisobingizdagi barcha Ads kabinetlar (customer id) topiladi.",
  },
  {
    id: "amocrm",
    name: "AmoCRM",
    logo: "A",
    color: "#8b5cf6",
    button: "AmoCRM hisobini ulash",
    hint: "Leadlar har sync'da to'g'ridan-to'g'ri API'dan tortiladi — webhook shart emas.",
  },
] as const;

function statusChip(status: "active" | "expired" | "error") {
  if (status === "active") return { cls: "good", text: "FAOL" };
  if (status === "expired") return { cls: "warn", text: "TOKEN ESKIRGAN" };
  return { cls: "muted", text: "XATO" };
}

function OAuthConnectionCard({
  conn,
  onToggle,
  onDelete,
  busy,
}: {
  conn: NonNullable<ConnectionInfo["oauth"]>["connections"][number];
  onToggle: (accountId: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const chip = statusChip(conn.status);
  return (
    <div
      className="conn-card"
      style={{
        marginTop: 10,
        borderColor:
          conn.status === "active"
            ? "color-mix(in srgb, var(--good) 40%, var(--line))"
            : conn.status === "expired"
              ? "color-mix(in srgb, var(--warn) 40%, var(--line))"
              : undefined,
      }}
    >
      <div className="c-head">
        <b style={{ fontSize: 13 }}>{conn.label}</b>
        <span className={`chip ${chip.cls}`} style={{ marginLeft: "auto", flex: "none" }}>
          <i /> {chip.text}
        </span>
      </div>
      {conn.error && (
        <div className="conn-kv">
          <span>Xato</span>
          <b style={{ color: "var(--risk)" }}>{conn.error}</b>
        </div>
      )}
      <div className="conn-kv">
        <span>Oxirgi sync</span>
        <b>{conn.lastSyncAt ? dateLabel(conn.lastSyncAt) : "—"}</b>
      </div>
      {conn.accounts.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <small style={{ color: "var(--muted)", display: "block", marginBottom: 6 }}>
            Kabinetlar (o'chirilgani sync qilinmaydi):
          </small>
          {conn.accounts.map(a => (
            <label
              key={a.id}
              className="amo-account-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 0",
                cursor: "pointer",
                fontSize: 12.5,
              }}
            >
              <input
                type="checkbox"
                checked={a.enabled}
                onChange={() => onToggle(a.id)}
                disabled={busy}
              />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {a.name}
              </span>
              <span
                className="chip muted"
                style={{ marginLeft: "auto", flex: "none", fontSize: 10 }}
              >
                {a.currency}
                {a.lastSyncAt ? " · " + dateLabel(a.lastSyncAt) : ""}
              </span>
            </label>
          ))}
        </div>
      )}
      <button
        className="tf-btn"
        style={{
          marginTop: 10,
          width: "100%",
          justifyContent: "center",
          color: "var(--risk)",
        }}
        onClick={onDelete}
        disabled={busy}
      >
        <Trash2 size={12} /> Ulanishni olib tashlash
      </button>
    </div>
  );
}

function OAuthPanel() {
  const { connections, refresh } = useDashboardContext();
  const [subdomain, setSubdomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  const toggleAccount = async (connectionId: string, accountId: string) => {
    setBusy(true);
    try {
      await fetch(
        `/api/oauth/accounts/${encodeURIComponent(connectionId)}/${encodeURIComponent(
          accountId
        )}/toggle`,
        { method: "POST" }
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const deleteConnection = async (connectionId: string) => {
    setBusy(true);
    try {
      await fetch(`/api/oauth/connections/${encodeURIComponent(connectionId)}`, {
        method: "DELETE",
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const connect = (platform: string) => {
    if (platform === "amocrm") {
      const sub = subdomain.trim().toLowerCase().replace(/\.amocrm\.ru$/, "");
      if (!sub) {
        setSubError("Avval subdomenni kiriting (masalan: sofexpo)");
        return;
      }
      window.location.href = `/api/oauth/amocrm/start?subdomain=${encodeURIComponent(sub)}`;
      return;
    }
    window.location.href = `/api/oauth/${platform}/start`;
  };

  return (
    <Panel
      kicker="OAuth — bitta tugma"
      title="O'z hisoblaringizni ulang"
      style={{ marginBottom: 14 }}
    >
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
        Har bir loyihangizning Facebook, Google va AmoCRM hisobini o'zingiz ulaysiz
        — tokenlar serverda saqlanadi, ma'lumot har{" "}
        {Math.round(300 / 60)} daqiqada avtomatik yangilanadi. Ulangach, tepadagi
        kabinet tanlagichdan xohlagan hisobni ko'rish mumkin.
      </p>
      <div className="conn-grid">
        {OAUTH_PLATFORMS.map(p => {
          const conn = connections.find(c => c.id === p.id);
          const oauth = conn?.oauth;
          const ready = oauth?.ready ?? false;
          const linked = oauth?.connections ?? [];
          return (
            <div className="conn-card" key={p.id}>
              <div className="c-head">
                <span className="conn-logo" style={{ background: p.color }}>
                  {p.logo}
                </span>
                <div style={{ minWidth: 0 }}>
                  <b>{p.name}</b>
                  <small>{linked.length > 0 ? `${linked.length} hisob ulangan` : p.hint}</small>
                </div>
                {linked.length > 0 && (
                  <span className="chip good" style={{ marginLeft: "auto", flex: "none" }}>
                    <i /> {linked.length}
                  </span>
                )}
              </div>
              {p.id === "amocrm" && (
                <div style={{ margin: "10px 0 0" }}>
                  <input
                    type="text"
                    style={{
                      width: "100%",
                      height: 32,
                      padding: "0 10px",
                      borderRadius: "var(--r-md)",
                      border: "1px solid var(--line)",
                      background: "var(--panel)",
                      color: "var(--text)",
                      fontSize: 12,
                      outline: "none",
                    }}
                    placeholder="subdomain (masalan: sofexpo)"
                    value={subdomain}
                    onChange={e => {
                      setSubdomain(e.target.value);
                      setSubError(null);
                    }}
                  />
                  {subError && (
                    <small style={{ color: "var(--risk)" }}>{subError}</small>
                  )}
                </div>
              )}
              <button
                className="primary-btn"
                style={{ marginTop: 10, width: "100%" }}
                onClick={() => connect(p.id)}
                disabled={!ready}
                title={ready ? undefined : oauth?.reason}
              >
                <Link2 size={13} /> {p.button}
              </button>
              {!ready && (
                <small
                  style={{
                    display: "block",
                    marginTop: 8,
                    color: "var(--muted)",
                    lineHeight: 1.5,
                  }}
                >
                  ⚠ {oauth?.reason ?? "Serverda app kalitlari yo'q"}
                </small>
              )}
              {linked.map(c => (
                <OAuthConnectionCard
                  key={c.id}
                  conn={c}
                  busy={busy}
                  onToggle={accountId => void toggleAccount(c.id, accountId)}
                  onDelete={() => void deleteConnection(c.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

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

      {/* OAuth — o'z hisoblarini ulash */}
      <OAuthPanel />

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
