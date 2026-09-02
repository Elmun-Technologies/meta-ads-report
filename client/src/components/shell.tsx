import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Command,
  Gauge,
  LayoutDashboard,
  Menu,
  Moon,
  Plug,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Target,
  Users,
  Workflow,
  X,
  FileText,
} from "lucide-react";
import { PLATFORM_META, type PlatformId } from "@shared/types";
import { ago } from "@/lib/format";
import { useDashboardContext } from "@/contexts/DashboardContext";
import { AlertsMenu } from "./AlertsMenu";

export interface NavItem {
  path: string;
  label: string;
  /** Bir gaplik tushuntirish — sidebar va ⌘K da ko'rsatiladi */
  hint: string;
  icon: typeof LayoutDashboard;
  count?: "campaigns" | "creatives" | "crmLeads";
}

export const NAV: NavItem[] = [
  {
    path: "/",
    label: "Umumiy natijalar",
    hint: "Sarf, murojaat narxi va diqqat talab qiladigan kampaniyalar",
    icon: LayoutDashboard,
  },
  {
    path: "/campaigns",
    label: "Kampaniyalar",
    hint: "Har bir kampaniya kesimida to'liq jadval va tafsilot",
    icon: Target,
    count: "campaigns",
  },
  {
    path: "/creatives",
    label: "Kreativlar",
    hint: "Qaysi rasm/video ko'proq ishladi",
    icon: Sparkles,
    count: "creatives",
  },
  {
    path: "/audience",
    label: "Auditoriya",
    hint: "Yosh bo'yicha sarf, murojaat va narx",
    icon: Users,
  },
  {
    path: "/leads",
    label: "Kampaniya tuzilmasi",
    hint: "Expo → kampaniya → guruh → kreativ qatlamlari",
    icon: Gauge,
  },
  {
    path: "/pipeline",
    label: "Murojaat yo'li (CRM)",
    hint: "Murojaat bitimga aylandimi, qayerda to'xtadi",
    icon: Workflow,
    count: "crmLeads",
  },
  {
    path: "/compare",
    label: "Taqqoslash",
    hint: "Ikki davr yoki kampaniyalarni solishtirish",
    icon: ArrowLeftRight,
  },
  {
    path: "/report",
    label: "Hisobot",
    hint: "Rahbariyat uchun bir sahifalik qisqa hisobot (chop etish/PDF)",
    icon: FileText,
  },
  {
    path: "/connections",
    label: "Ulanishlar",
    hint: "Qaysi platforma ulangan, ma'lumot qayerdan keladi",
    icon: Plug,
  },
];

const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  NAV.map(n => [n.path, n.label])
);
const PAGE_HINTS: Record<string, string> = Object.fromEntries(
  NAV.map(n => [n.path, n.hint])
);

function PlatformLogo({ id, size = 22 }: { id: PlatformId; size?: number }) {
  const meta = PLATFORM_META[id];
  return (
    <span
      className="p-dot"
      style={{
        background: meta.color,
        width: size,
        height: size,
        borderRadius: size / 3.2,
      }}
    >
      {id === "meta" ? "f" : id === "google-ads" ? "G" : "Я"}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    connections,
    snapshot,
    crm,
    crmConnected,
    live,
    lastEventAt,
    source,
  } = useDashboardContext();
  const [location] = useLocation();
  const meta = snapshot?.meta;
  const adsConnections = connections.filter(c => c.kind !== "crm");
  const crmConnection = connections.find(c => c.kind === "crm");

  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand">
        <span className="brand-mark">
          <Activity size={18} strokeWidth={2.4} />
        </span>
        <div style={{ minWidth: 0 }}>
          <b>SOF·EXPO</b>
          <small>Reklama hisobotlari</small>
        </div>
        <button
          className="icon-btn mobile-only"
          style={{ marginLeft: "auto", width: 30, height: 30 }}
          onClick={onClose}
          aria-label="Yopish"
        >
          <X size={16} />
        </button>
      </div>

      <div className="side-section">
        <div className="side-caption">Platformalar</div>
        <div className="platform-switch">
          {adsConnections.map(conn => {
            const pm = PLATFORM_META[conn.id as PlatformId];
            const connected = conn.status === "connected";
            return (
              <Link
                key={conn.id}
                href={connected ? "/" : "/connections"}
                onClick={onClose}
                className={`platform-row ${meta?.platform === conn.id ? "active" : ""}`}
              >
                <PlatformLogo id={conn.id as PlatformId} />
                <span className="p-info">
                  <b>{pm?.name ?? conn.name}</b>
                  <small>
                    {connected
                      ? `${conn.accounts.length} ta kabinet ulangan`
                      : "ulanmagan"}
                  </small>
                </span>
                <span className={`p-status ${connected ? "on" : "off"}`}>
                  {connected ? "Ulangan" : "Kutilyapti"}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {crmConnection && (
        <div className="side-section">
          <div className="side-caption">CRM · bitimgacha</div>
          <Link
            href="/pipeline"
            onClick={onClose}
            className={`platform-row ${location === "/pipeline" ? "active" : ""}`}
          >
            <span
              className="p-dot"
              style={{
                background: "#8b5cf6",
                width: 22,
                height: 22,
                borderRadius: 7,
                display: "grid",
                placeItems: "center",
                fontSize: 10,
                fontWeight: 800,
                color: "#fff",
              }}
            >
              A
            </span>
            <span className="p-info">
              <b>AmoCRM</b>
              <small>
                {crmConnected
                  ? `${crm?.leads.length ?? 0} ta murojaat kuzatilmoqda`
                  : "ulanmagan — /pipeline sahifasi"}
              </small>
            </span>
            <span className={`p-status ${crmConnected ? "on" : "off"}`}>
              {crmConnected ? "Ulangan" : "Kutilyapti"}
            </span>
          </Link>
        </div>
      )}

      <div className="side-section">
        <div className="side-caption">Kabinet</div>
        <div className="account-card">
          <span
            className="a-dot"
            style={{ background: live ? "var(--good)" : "var(--text-3)" }}
          />
          <div className="a-info">
            <small>{meta?.account.externalId ?? "—"}</small>
            <b>{meta?.account.name ?? "Kabinet ulanmagan"}</b>
          </div>
        </div>
      </div>

      <div className="side-section">
        <div className="side-caption">Bo'limlar</div>
        <nav className="side-nav">
          {NAV.map(item => {
            const active = location === item.path;
            const count =
              item.count === "campaigns"
                ? snapshot?.campaigns.length
                : item.count === "creatives"
                  ? snapshot?.creatives.length
                  : item.count === "crmLeads"
                    ? crm?.leads.length
                    : undefined;
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={onClose}
                className={active ? "active" : ""}
                title={item.hint}
              >
                <item.icon size={16} strokeWidth={2} />
                <span>{item.label}</span>
                {count != null && <span className="count">{count}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="side-sync">
        <div className="s-row">
          <span className={`live-dot ${live ? "pulse" : "off"}`} />
          <b style={{ fontSize: 11.5, fontWeight: 600 }}>
            {source === "static"
              ? "Ma'lumot: o'zgarmas nusxa"
              : live
                ? "Avtomatik yangilanish yoqilgan"
                : "Vaqti-vaqti bilan tekshiriladi"}
          </b>
        </div>
        <div className="s-meta">
          Manba: <b>{meta?.sourceLabel ?? "—"}</b>
          <br />
          Yangilangan: <b>{ago(meta?.syncedAt ?? lastEventAt)}</b>
          {meta && (
            <>
              <br />
              Davr: <b>{meta.period.label || "—"}</b>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Topbar                                                              */
/* ------------------------------------------------------------------ */

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const {
    snapshot,
    snapshots,
    snapshotFile,
    setSnapshotFile,
    syncing,
    refresh,
    theme,
    toggleTheme,
    setPaletteOpen,
    live,
    source,
  } = useDashboardContext();
  const [location] = useLocation();
  const platformName = snapshot
    ? PLATFORM_META[snapshot.meta.platform].name
    : "—";
  const initials =
    (snapshot?.meta.account.name ?? "SE")
      .split(/[\s|·-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() ?? "")
      .join("") || "SE";

  return (
    <header className="topbar">
      <button
        className="icon-btn mobile-only"
        onClick={onMenu}
        aria-label="Menyu"
      >
        <Menu size={17} />
      </button>
      <div className="crumb">
        <span>{platformName}</span>
        <Chevron className="sep" />
        <b title={PAGE_HINTS[location]}>{PAGE_TITLES[location] ?? "Sahifa"}</b>
      </div>
      <div className="top-actions">
        <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
          <Search size={14} />
          <span className="st-label">Qidiruv va buyruqlar…</span>
          <span className="kbd">⌘K</span>
        </button>
        {snapshots.length > 1 && (
          <select
            className="select-btn snap-select desktop-only"
            value={snapshotFile ?? snapshots[0]?.file ?? ""}
            onChange={e => setSnapshotFile(e.target.value)}
            title="Kabinet / davr tanlash"
          >
            {snapshots.map(s => (
              <option key={s.file} value={s.file}>
                {s.accountName} · {s.periodLabel}
              </option>
            ))}
          </select>
        )}
        <button
          className={`icon-btn ${syncing ? "spin" : ""}`}
          onClick={() => void refresh()}
          title="Ma'lumotni yangilash"
        >
          <RefreshCw size={15} />
        </button>
        <span className="pill desktop-only">
          <span
            className={`live-dot ${live ? "pulse" : "off"}`}
            style={{ width: 6, height: 6 }}
          />
          {snapshot?.meta.period.label || "davr ko'rsatilmagan"}
        </span>
        {source === "static" && (
          <span
            className="src-badge static desktop-only"
            title="Server (API) javob bermadi — build vaqtida saqlangan ma'lumot ko'rsatilmoqda. Yangilash uchun loyihani qayta deploy qiling."
          >
            Build vaqtidagi ma'lumot
          </span>
        )}
        <button
          className="icon-btn"
          onClick={toggleTheme}
          title={theme === "dark" ? "Yorug' tema" : "Tungi tema"}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <AlertsMenu />
        <div
          className="avatar"
          title={snapshot?.meta.account.name ?? "Kabinet ulanmagan"}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Command palette (⌘K)                                                */
/* ------------------------------------------------------------------ */

export function CommandPalette() {
  const {
    paletteOpen,
    setPaletteOpen,
    snapshot,
    crm,
    openCampaign,
    openCreative,
    openLead,
    toggleTheme,
    theme,
    refresh,
  } = useDashboardContext();
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [paletteOpen]);

  const items = useMemo(() => {
    const nav = NAV.map(n => ({
      group: "Sahifalar",
      label: n.label,
      icon: <n.icon size={13} />,
      meta: n.path,
      run: () => navigate(n.path),
    }));
    const actions = [
      {
        group: "Amallar",
        label:
          theme === "dark" ? "Yorug' temaga o'tish" : "Tungi temaga o'tish",
        icon: <Sun size={13} />,
        meta: "",
        run: toggleTheme,
      },
      {
        group: "Amallar",
        label: "Ma'lumotni yangilash (sync)",
        icon: <RefreshCw size={13} />,
        meta: "",
        run: () => void refresh(),
      },
    ];
    const campaigns = (snapshot?.campaigns ?? []).slice(0, 30).map(c => ({
      group: "Kampaniyalar",
      label: c.originalName,
      icon: <Target size={13} />,
      meta: `$${Math.round(c.metrics.spend)} · ${c.metrics.leads} lead`,
      run: () => openCampaign(c.id),
    }));
    const creatives = (snapshot?.creatives ?? []).slice(0, 30).map(c => ({
      group: "Kreativlar",
      label: c.originalName,
      icon: <Sparkles size={13} />,
      meta: `$${Math.round(c.metrics.spend)}`,
      run: () => openCreative(c.id),
    }));
    const leads = (crm?.leads ?? []).slice(0, 25).map(l => ({
      group: "CRM Leadlar",
      label: l.name,
      icon: <Target size={13} />,
      meta: l.stageName,
      run: () => openLead(l.id),
    }));
    const all = [...nav, ...actions, ...campaigns, ...creatives, ...leads];
    if (!query.trim()) return all.slice(0, 22);
    const q = query.toLowerCase();
    return all.filter(i => i.label.toLowerCase().includes(q)).slice(0, 22);
  }, [
    query,
    snapshot,
    theme,
    toggleTheme,
    refresh,
    openCampaign,
    openCreative,
  ]);

  if (!paletteOpen) return null;

  const flat = items;
  const runItem = (i: number) => {
    flat[i]?.run();
    setPaletteOpen(false);
  };

  return (
    <div className="cmdk-overlay" onClick={() => setPaletteOpen(false)}>
      <div
        className="cmdk"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel(s => Math.min(s + 1, flat.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel(s => Math.max(s - 1, 0));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            runItem(sel);
          }
        }}
      >
        <div className="cmdk-input">
          <Command size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSel(0);
            }}
            placeholder="Kampaniya, kreativ yoki sahifa bo'yicha qidirish…"
          />
          <span
            className="kbd"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: "2px 6px",
              color: "var(--text-3)",
            }}
          >
            ESC
          </span>
        </div>
        <div className="cmdk-list">
          {flat.length === 0 && (
            <div className="cmdk-empty">
              Hech narsa topilmadi — boshqa so'z bilan urinib ko'ring.
            </div>
          )}
          {flat.map((item, i) => (
            <div key={`${item.group}-${item.label}-${i}`}>
              {(i === 0 || flat[i - 1].group !== item.group) && (
                <div className="cmdk-group">{item.group}</div>
              )}
              <button
                className={`cmdk-item ${sel === i ? "sel" : ""}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => runItem(i)}
              >
                <span className="c-ico">{item.icon}</span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </span>
                {item.meta && <span className="c-meta">{item.meta}</span>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
