import {
  ArrowUpRight,
  Check,
  Clock,
  Download,
  Radio,
  ServerCog,
} from "lucide-react";
import { PLATFORM_META } from "@shared/types";
import { PageHint } from "@/components/Help";
import { ago, dateLabel, whole } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { Panel } from "@/components/widgets";

const ROADMAP = [
  {
    title: "Meta Ads MCP",
    status: "Ulangan",
    tone: "var(--good)",
    points: [
      "Kabinet: act_1883723989171211 (Sof-Expo l Nazir)",
      "Snapshot → server/data/snapshots → live SSE sync",
      "Yangi snapshot tushsa dashboard avtomatik yangilanadi",
    ],
  },
  {
    title: "Google Ads MCP",
    status: "Connector tayyor",
    tone: "var(--warn)",
    points: [
      "Google Ads MCP'dan campaign/ad snapshot olinadi",
      "shared/ qatlamga google-ads normalizer qo'shiladi",
      "UI hech qanday o'zgartirishsiz ko'radi (umumiy model)",
    ],
  },
  {
    title: "Yandex Direct",
    status: "Rejada",
    tone: "var(--text-3)",
    points: [
      "Yandex Direct API token orqali ulanadi",
      "Direct kampaniyalari xuddi shu KPI ledgerda chiqadi",
      "Valyuta konvertatsiyasi (RUB→USD) qo'llanadi",
    ],
  },
];

export default function Connections() {
  const { connections, snapshot, live, refresh } = useDashboardContext();

  return (
    <>
      <div className="page-head">
        <div>
          <span className="kicker">Ma'lumot qayerdan keladi</span>
          <h1>Ulanishlar</h1>
          <p>
            Bu dashboard bir nechta platformani bitta shaklga keltirib
            ko'rsatadi: har bir manba (Meta, Google Ads, Yandex Direct, AmoCRM)
            avval umumiy modelga o'tkaziladi. Yangi platforma ulanganda alohida
            sahifa ochilmaydi — barcha raqamlar shu panelga qo'shiladi.
          </p>
        </div>
        <div className="right">
          <button className="primary-btn" onClick={() => void refresh()}>
            <Radio size={13} /> Ulanganligini tekshirish
          </button>
        </div>
      </div>

      <PageHint>
        Bu sahifa — <b>raqamlarning kelib chiqish joyi</b>: qaysi platforma
        ulangan, ma'lumot qachon olingan va qaysi ma'lumotlar manba tomonidan
        berilmagan. Agar biror ko'rsatkich “N/A” bo'lsa, sababi shu yerda
        yozilgan.
      </PageHint>

      <div className="conn-grid" style={{ marginBottom: 14 }}>
        {connections.map(conn => {
          const isCrm = conn.kind === "crm";
          const pm = isCrm
            ? null
            : PLATFORM_META[conn.id as keyof typeof PLATFORM_META];
          const connected = conn.status === "connected";
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
                  style={{
                    background: isCrm
                      ? "#8b5cf6"
                      : (pm?.color ?? "var(--accent)"),
                  }}
                >
                  {conn.id === "meta"
                    ? "f"
                    : conn.id === "google-ads"
                      ? "G"
                      : conn.id === "yandex-direct"
                        ? "Я"
                        : conn.id === "amocrm"
                          ? "A"
                          : "•"}
                </span>
                <div style={{ minWidth: 0 }}>
                  <b>{conn.name}</b>
                  <small>{conn.vendor}</small>
                </div>
                <span
                  className={`chip ${connected ? "good" : "muted"}`}
                  style={{ marginLeft: "auto", flex: "none" }}
                >
                  <i /> {connected ? "ULANGAN" : "TAYYOR"}
                </span>
              </div>
              <p>{conn.note}</p>
              <div>
                <div className="conn-kv">
                  <span>{isCrm ? "Hisoblar" : "Kabinetlar"}</span>
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
                    {connected ? (live ? "SSE · faol" : "Polling · 60s") : "—"}
                  </b>
                </div>
                {connected &&
                  !isCrm &&
                  snapshot &&
                  snapshot.meta.platform === conn.id && (
                    <div className="conn-kv">
                      <span>Davr</span>
                      <b>{snapshot.meta.period.label}</b>
                    </div>
                  )}
              </div>
              {!connected && (
                <button
                  className="tf-btn"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => void refresh()}
                  title="Snapshot papkasini qayta tekshirish"
                >
                  <Download size={13} /> Snapshot kutilmoqda — tekshirish
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid-12">
        <div className="col-7">
          <Panel kicker="Yangi platforma ulash" title="Qanday ishlaydi">
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {ROADMAP.map((r, i) => (
                <div
                  key={r.title}
                  style={{ display: "flex", gap: 14, padding: "13px 0" }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 10,
                      flex: "none",
                      display: "grid",
                      placeItems: "center",
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      fontWeight: 700,
                      color: r.tone,
                      background:
                        "color-mix(in srgb, currentColor 12%, transparent)",
                      border: `1px solid ${r.tone}`,
                    }}
                  >
                    {i + 1 === 1 ? <Check size={14} /> : i + 1}
                  </span>
                  <div>
                    <h4
                      style={{
                        margin: "2px 0 6px",
                        fontSize: 13,
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      {r.title}
                      <span
                        className="chip muted"
                        style={{ color: r.tone, borderColor: "transparent" }}
                      >
                        {r.status}
                      </span>
                    </h4>
                    {r.points.map(p => (
                      <p
                        key={p}
                        style={{
                          margin: "3px 0",
                          fontSize: 11.5,
                          color: "var(--text-2)",
                          lineHeight: 1.5,
                        }}
                      >
                        · {p}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="col-5">
          <Panel
            kicker="Texnik tuzilma"
            title="Ma'lumot qanday oqadi"
            sub="Hech qanday qo'lda yozilgan yoki taxminiy raqam yo'q — faqat real eksportlar"
          >
            <div className="d-kv">
              <span>Manba</span>
              <b>{snapshot?.meta.sourceLabel ?? "—"}</b>
            </div>
            <div className="d-kv">
              <span>Snapshot joyi</span>
              <b>server/data/snapshots/</b>
            </div>
            <div className="d-kv">
              <span>Normalize qatlam</span>
              <b>shared/normalize.ts</b>
            </div>
            <div className="d-kv">
              <span>API</span>
              <b>/api/snapshot · /api/connections</b>
            </div>
            <div className="d-kv">
              <span>Live kanal</span>
              <b>/api/stream (SSE) + fs.watch</b>
            </div>
            <div className="d-kv">
              <span>Yangilangan</span>
              <b>{ago(snapshot?.meta.syncedAt)}</b>
            </div>
            {snapshot && (
              <>
                <div className="d-kv">
                  <span>Kampaniyalar</span>
                  <b>{whole(snapshot.campaigns.length)}</b>
                </div>
                <div className="d-kv">
                  <span>Kreativlar</span>
                  <b>{whole(snapshot.creatives.length)}</b>
                </div>
              </>
            )}
            <div className="note-strip" style={{ marginTop: 12 }}>
              <ServerCog
                size={15}
                style={{ flex: "none", color: "var(--accent)" }}
              />
              <span>
                MCP yangi snapshot yozganda <b>fs.watch</b> darhol sezadi va SSE
                orqali hamma ochiq dashboardga push qiladi. Sahifani yangilash
                shart emas.
                <br />
                <a
                  className="panel-link"
                  href="/api/health"
                  target="_blank"
                  style={{ marginTop: 4, display: "inline-flex" }}
                >
                  /api/health ni ko'rish <ArrowUpRight size={11} />
                </a>
              </span>
            </div>
          </Panel>
        </div>
      </div>

      {snapshot?.meta.limitations?.length ? (
        <Panel
          kicker="Manba cheklovlari"
          title="Meta API bu eksportda bermagan ma'lumotlar"
          style={{ marginTop: 14 }}
        >
          {snapshot.meta.limitations.map(l => (
            <div className="d-kv" key={l}>
              <Clock size={12} style={{ color: "var(--warn)", flex: "none" }} />
              <span style={{ textAlign: "left" }}>{l}</span>
            </div>
          ))}
        </Panel>
      ) : null}
    </>
  );
}
