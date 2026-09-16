import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  FolderOpen,
  KeyRound,
  Link2,
  Radio,
  RefreshCw,
  Settings2,
  Trash2,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { PLATFORM_META, type ConnectionInfo, type OAuthAppStatus } from "@shared/types";
import {
  ALL_SETUP,
  OAUTH_PLATFORM_IDS,
  type OAuthPlatformId,
  type SetupId,
} from "@shared/oauthSetup";
import { dateLabel, whole } from "@/lib/format";
import { STATIC_MODE_HINT, probeApiHealth, type ApiHealth } from "@/lib/api";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { ConnectSetup, type SetupTab } from "@/components/ConnectSetup";
import { SnapshotUpload } from "@/components/SnapshotUpload";
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
        t: "Yoki faylni nomlab, pastdagi «Eksport faylni yuklash» panelidan yuklang (yoki papkaga tashlang):",
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
        t: "Real-time rejim (tavsiya): tepadagi «Facebook bilan ulash» yoki «Token bilan ulash» — kabinetlar avtomatik topiladi, sync har 5 daqiqada o'zi tortadi. Yoki .env ga yozing:",
        code: "META_ACCESS_TOKEN=...\nMETA_AD_ACCOUNT_ID=act_...\nSYNC_INTERVAL_SEC=300",
      },
      {
        t: "Yoki MCP standart eksportini olib, faylni nomlab «Eksport faylni yuklash» panelidan yuklang:",
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
        t: "Yoki kampaniyalar kesimida eksport olib, faylni nomlab «Eksport faylni yuklash» panelidan yuklang:",
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
        t: "TGStat tokenini oling (tgstat.ru → Личный кабинет → API token) va tepadagi «Telegram» kartasidagi «TGStat tokenini kiritish» tugmasidan saqlang — .env tahrirlash shart emas:",
        code: "yoki .env orqali: TGSTAT_TOKEN=...",
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
        t: "Faylni nomlab, «Eksport faylni yuklash» panelidan yuklang (yoki papkaga tashlang):",
        code: "server/data/snapshots/yandex_<login>_<davr>.json",
      },
    ],
    verify:
      "Chap panelda Yandex Direct «Ulangan»ga o‘tadi (RUB→USD konvertatsiya bilan).",
  },
];

/* ------------------------------------------------------------------ */
/* Ulanish — OAuth dialog YOKI token bilan                             */
/*                                                                     */
/* Muhim: tugmalar hech qachon `disabled` turmaydi. App kalitlari bo'l- */
/* masa, bosilganda sozlash oynasi ochiladi — kalitni shu yerdan kirit- */
/* sa (yoki tayyor token bilan ulansa) hisob darhol ulanadi.            */
/* ------------------------------------------------------------------ */

/** Kartalarda ko'rsatiladigan manbalar: OAuth platformalar + Telegram (TGStat) */
const SETUP_PLATFORMS: SetupId[] = [...OAUTH_PLATFORM_IDS, "telegram"];

function statusChip(status: "active" | "expired" | "error") {
  if (status === "active") return { cls: "good", text: "FAOL" };
  if (status === "expired") return { cls: "warn", text: "TOKEN ESKIRGAN" };
  return { cls: "muted", text: "XATO" };
}

/** Context'dagi /api/connections javobini setup holatiga aylantirish */
function contextStatus(o?: ConnectionInfo["oauth"]): OAuthAppStatus | null {
  if (!o) return null;
  return {
    ready: o.ready,
    missing: o.missing ?? [],
    reason: o.reason,
    source: o.source ?? "none",
    values: o.values ?? {},
    oauth: o.ready,
    manual: o.manual ?? false,
  };
}

const SOURCE_LABEL: Record<OAuthAppStatus["source"], string> = {
  env: ".env dan",
  store: "UI'dan kiritilgan",
  mixed: ".env + UI",
  none: "kiritilmagan",
};

function OAuthConnectionCard({
  conn,
  onToggle,
  onDelete,
  onSync,
  busy,
}: {
  conn: NonNullable<ConnectionInfo["oauth"]>["connections"][number];
  onToggle: (accountId: string) => void;
  onDelete: () => void;
  onSync: () => void;
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
        <span className="chip muted" style={{ flex: "none", fontSize: 10 }}>
          {conn.method === "token" ? "TOKEN" : "OAUTH"}
        </span>
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
        <b>{conn.lastSyncAt ? dateLabel(conn.lastSyncAt) : "hali tortilmagan"}</b>
      </div>
      {conn.accounts.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <small style={{ color: "var(--text-2)", display: "block", marginBottom: 6 }}>
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
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          className="tf-btn"
          style={{ flex: 1, justifyContent: "center" }}
          onClick={onSync}
          disabled={busy}
          title="Shu ulanishdan ma'lumotni hoziroq tortish"
        >
          <RefreshCw size={12} className={busy ? "spin" : ""} /> Hoziroq tortish
        </button>
        <button
          className="tf-btn"
          style={{ color: "var(--risk)" }}
          onClick={onDelete}
          disabled={busy}
        >
          <Trash2 size={12} /> Olib tashlash
        </button>
      </div>
    </div>
  );
}

function OAuthPanel() {
  const { connections, refresh } = useDashboardContext();
  const [subdomain, setSubdomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ id: SetupId; tab: SetupTab } | null>(null);
  const [apps, setApps] = useState<Partial<Record<SetupId, OAuthAppStatus>> | null>(null);
  const [tgChannels, setTgChannels] = useState<{ count: number; hasToken: boolean } | null>(null);
  /** API server holati — statik rejimda (server yo'q) kalit saqlab bo'lmaydi */
  const [api, setApi] = useState<ApiHealth | null>(null);

  useEffect(() => {
    let alive = true;
    void probeApiHealth().then(h => {
      if (alive) setApi(h);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** App/servis kalitlari holati (maydon darajasida) — /api/oauth/apps dan */
  const loadApps = useCallback(async () => {
    try {
      const res = await fetch("/api/oauth/apps", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data = (await res.json()) as { platforms?: Partial<Record<SetupId, OAuthAppStatus>> };
      if (data?.platforms) setApps(data.platforms);
    } catch {
      /* server javob bermasa — context'dagi holat bilan davom etamiz */
    }
    try {
      const res = await fetch("/api/telegram/channels", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data = (await res.json()) as { channels?: unknown[]; hasToken?: boolean };
      setTgChannels({ count: data?.channels?.length ?? 0, hasToken: Boolean(data?.hasToken) });
    } catch {
      /* telegram paneli ixtiyoriy */
    }
  }, []);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

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
      toast.success("Ulanish olib tashlandi");
      await refresh();
    } catch {
      toast.error("Ulanishni o'chirib bo'lmadi");
    } finally {
      setBusy(false);
    }
  };

  /** Bitta manbani hoziroq tortish (interval kutmasdan) */
  const syncPlatform = async (id: SetupId) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/oauth/sync/${id}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        result?: { ok?: boolean; message?: string };
        error?: string;
      };
      const message = data?.result?.message ?? data?.error ?? "";
      if (res.ok && data?.result?.ok) {
        toast.success(`${ALL_SETUP[id].name} yangilandi`, { description: message });
      } else {
        toast.error(`${ALL_SETUP[id].name} — ma'lumot tortilmadi`, { description: message });
      }
      await refresh();
    } catch {
      toast.error("Server bilan aloqa yo'q");
    } finally {
      setBusy(false);
    }
  };

  const connect = (id: OAuthPlatformId, st: OAuthAppStatus | null) => {
    if (!st?.ready) {
      // Kalit yo'q — tugma baribir ishlaydi: sozlash oynasini ochamiz
      setSetup({ id, tab: "keys" });
      toast.info(`${ALL_SETUP[id].name} uchun app kalitlari kerak`, {
        description:
          st?.missing.length
            ? `Yetishmayapti: ${st.missing.map(m => m.label).join(", ")}. Oynadan kiriting yoki «Token bilan ulash» dan foydalaning.`
            : "Oynadan kalitlarni kiriting yoki tayyor token bilan ulang.",
      });
      return;
    }
    if (id === "amocrm") {
      const sub = subdomain.trim().toLowerCase().replace(/\.amocrm\.ru$/, "");
      if (!sub) {
        setSubError("Avval subdomenni kiriting (masalan: sofexpo)");
        return;
      }
      window.location.href = `/api/oauth/amocrm/start?subdomain=${encodeURIComponent(sub)}`;
      return;
    }
    window.location.href = `/api/oauth/${id}/start`;
  };

  return (
    <Panel
      kicker="Ulash — bitta tugma"
      title="O'z hisoblaringizni ulang"
      style={{ marginBottom: 14 }}
    >
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
        Ikki yo'l bor: <b>OAuth</b> (app kalitlari bilan — barcha kabinetlar avtomatik
        topiladi) yoki <b>token bilan ulash</b> (app yaratmasdan, tayyor kalit bilan).
        Kalitlarni shu oynadan kiritishingiz mumkin — serverni qayta ishga tushirish
        shart emas. Tokenlar faqat serverda saqlanadi, ma'lumot har{" "}
        {Math.round(300 / 60)} daqiqada avtomatik yangilanadi.
      </p>

      {/* Server holati — «Server xatosi (404)» kelganda sabab darhol ko'rinsin */}
      {api && (
        <div className={`setup-note ${api.ok ? "good" : "risk"}`} style={{ marginBottom: 12 }}>
          {api.ok ? <Check size={14} /> : <TriangleAlert size={14} />}
          <span className="setup-note-body">
            <b>
              {api.ok
                ? `API server ishlayapti${api.mode ? ` · ${api.mode}` : ""}`
                : "API server bilan aloqa yo'q — kalitlarni saqlab bo'lmaydi"}
            </b>
            {api.ok ? (
              <span>
                App kalitlari shu oynadan kiritiladi va serverda (server/data/store.json) saqlanadi —
                restart shart emas.
              </span>
            ) : (
              <>
                <span>{api.error}</span>
                <span>{STATIC_MODE_HINT}</span>
              </>
            )}
          </span>
        </div>
      )}

      <div className="conn-grid">
        {SETUP_PLATFORMS.map(id => {
          const spec = ALL_SETUP[id];
          const service = spec.kind === "service";
          const conn = connections.find(c => c.id === id);
          const st = apps?.[id] ?? contextStatus(conn?.oauth);
          const linked = conn?.oauth?.connections ?? [];
          return (
            <div className="conn-card" key={id}>
              <div className="c-head">
                <span className="conn-logo" style={{ background: spec.color }}>
                  {spec.logo}
                </span>
                <div style={{ minWidth: 0 }}>
                  <b>{spec.name}</b>
                  <small>
                    {linked.length > 0
                      ? `${linked.length} hisob ulangan`
                      : service && tgChannels?.count
                        ? `${tgChannels.count} kanal ulangan`
                        : spec.oauthHint}
                  </small>
                </div>
                {(linked.length > 0 || (service && (tgChannels?.count ?? 0) > 0)) && (
                  <span className="chip good" style={{ marginLeft: "auto", flex: "none" }}>
                    <i /> {linked.length || tgChannels?.count}
                  </span>
                )}
              </div>

              {/* App kalitlari holati — nima bor / nima yetishmaydi */}
              <div className="keys-row">
                <span className={`chip ${st?.ready ? "good" : "warn"}`}>
                  <i /> {st?.ready ? "KALITLAR TAYYOR" : "KALIT KERAK"}
                </span>
                <small>
                  {st?.ready
                    ? `Manba: ${SOURCE_LABEL[st.source]}`
                    : `Yetishmayapti: ${st?.missing.map(m => m.label).join(", ") || "—"}`}
                </small>
                <button
                  className="tf-btn"
                  style={{ marginLeft: "auto", flex: "none" }}
                  onClick={() => setSetup({ id, tab: "keys" })}
                >
                  <Settings2 size={12} /> Sozlash
                </button>
              </div>

              {id === "amocrm" && (
                <div style={{ margin: "2px 0 0" }}>
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
                  {subError && <small style={{ color: "var(--risk)" }}>{subError}</small>}
                </div>
              )}

              {service ? (
                <button
                  className="primary-btn"
                  style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
                  onClick={() => setSetup({ id, tab: "keys" })}
                  title={st?.ready ? "Tokenni yangilash / almashtirish" : "TGStat API tokenini kiritish"}
                >
                  <KeyRound size={13} /> {st?.ready ? "TGStat tokenini yangilash" : "TGStat tokenini kiritish"}
                </button>
              ) : (
                <button
                  className="primary-btn"
                  style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
                  onClick={() => connect(id as OAuthPlatformId, st)}
                  title={st?.ready ? spec.button : "Avval app kalitlarini kiritish kerak — oyna ochiladi"}
                >
                  <Link2 size={13} /> {spec.button}
                </button>
              )}

              {spec.manual && (
                <button
                  className="tf-btn"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => setSetup({ id, tab: "token" })}
                  title="App yaratmasdan, tayyor token bilan ulash"
                >
                  <KeyRound size={12} /> Token bilan ulash
                </button>
              )}

              {service && (
                <Link href="/telegram" className="tf-btn" style={{ width: "100%", justifyContent: "center" }}>
                  <Radio size={12} /> Telegram kanallar sahifasi
                </Link>
              )}

              {linked.map(c => (
                <OAuthConnectionCard
                  key={c.id}
                  conn={c}
                  busy={busy}
                  onToggle={accountId => void toggleAccount(c.id, accountId)}
                  onDelete={() => void deleteConnection(c.id)}
                  onSync={() => void syncPlatform(id)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {setup && (
        <ConnectSetup
          platform={setup.id}
          tab={setup.tab}
          status={apps?.[setup.id] ?? contextStatus(connections.find(c => c.id === setup.id)?.oauth)}
          onClose={() => setSetup(null)}
          onSaved={async () => {
            await loadApps();
            await refresh();
          }}
          onConnected={async () => {
            await loadApps();
            await refresh();
          }}
        />
      )}
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
            Ulashning uch yo'li bor: <b>OAuth</b> («… bilan ulash» tugmasi),{" "}
            <b>token bilan ulash</b> (app yaratmasdan) va <b>eksport faylini
            yuklash</b> (browser'dan — papkaga qo'lda tashlash shart emas).
            Tugmalar har doim bosiladi — kalit yetishmasa sozlash oynasi
            ochiladi. Pastda har bir manba uchun aniq qadamlar.
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

      {/* Eksport faylni browser'dan yuklash (hosting'da papkaga tashlab bo'lmasa) */}
      <div style={{ marginBottom: 14 }}>
        <div className="upload-head">
          <span className="kicker">Uchinchi yo'l</span>
          <h2 style={{ fontSize: 15, margin: 0 }}>Eksport faylni yuklash</h2>
        </div>
        <SnapshotUpload />
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
