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
  icon: typeof LayoutDashboard;
  count?: "campaigns" | "creatives";
}

export const NAV: NavItem[] = [
  { path: "/", label: "Boshqaruv", icon: LayoutDashboard },
  { path: "/campaigns", label: "Kampaniyalar", icon: Target, count: "campaigns" },
  { path: "/creatives", label: "Kreativlar", icon: Sparkles, count: "creatives" },
  { path: "/audience", label: "Auditoriya", icon: Users },
  { path: "/leads", label: "Lead Explorer", icon: Gauge },
  { path: "/compare", label: "Taqqoslash", icon: ArrowLeftRight },
  { path: "/report", label: "Hisobot", icon: FileText },
  { path: "/connections", label: "Integratsiyalar", icon: Plug },
];

const PAGE_TITLES: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.path, n.label]));

function PlatformLogo({ id, size = 22 }: { id: PlatformId; size?: number }) {
  const meta = PLATFORM_META[id];
  return (
    <span className="p-dot" style={{ background: meta.color, width: size, height: size, borderRadius: size / 3.2 }}>
      {id === "meta" ? "f" : id === "google-ads" ? "G" : "Я"}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connections, snapshot, live, lastEventAt } = useDashboardContext();
  const [location] = useLocation();
  const meta = snapshot?.meta;

  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand">
        <span className="brand-mark">
          <Activity size={18} strokeWidth={2.4} />
        </span>
        <div style={{ minWidth: 0 }}>
          <b>SOF·EXPO</b>
          <small>Ads Command Center</small>
        </div>
        <button className="icon-btn mobile-only" style={{ marginLeft: "auto", width: 30, height: 30 }} onClick={onClose} aria-label="Yopish">
          <X size={16} />
        </button>
      </div>

      <div className="side-section">
        <div className="side-caption">PLATFORMALAR</div>
        <div className="platform-switch">
          {connections.map((conn) => {
            const pm = PLATFORM_META[conn.id];
            const connected = conn.status === "connected";
            return (
              <Link key={conn.id} href={connected ? "/" : "/connections"} onClick={onClose} className={`platform-row ${meta?.platform === conn.id ? "active" : ""}`}>
                <PlatformLogo id={conn.id} />
                <span className="p-info">
                  <b>{pm.name}</b>
                  <small>{connected ? `${conn.accounts.length} kabinet ulangan` : "ulanmagan"}</small>
                </span>
                <span className={`p-status ${connected ? "on" : "off"}`}>{connected ? "LIVE" : "READY"}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="side-section">
        <div className="side-caption">KABINET</div>
        <div className="account-card">
          <span className="a-dot" style={{ background: live ? "var(--good)" : "var(--text-3)", boxShadow: live ? "0 0 0 4px var(--good-soft)" : "none" }} />
          <div className="a-info">
            <small>{meta?.account.externalId ?? "—"}</small>
            <b>{meta?.account.name ?? "Kabinet ulanmagan"}</b>
          </div>
        </div>
      </div>

      <div className="side-section">
        <div className="side-caption">HISOBOT</div>
        <nav className="side-nav">
          {NAV.map((item) => {
            const active = location === item.path;
            const count = item.count === "campaigns" ? snapshot?.campaigns.length : item.count === "creatives" ? snapshot?.creatives.length : undefined;
            return (
              <Link key={item.path} href={item.path} onClick={onClose} className={active ? "active" : ""}>
                <item.icon size={16.5} strokeWidth={2} />
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
          <b style={{ fontSize: 11.5, fontWeight: 650 }}>{live ? "Live sync faol" : "Polling rejimi"}</b>
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
  const { snapshot, syncing, refresh, theme, toggleTheme, setPaletteOpen, live } = useDashboardContext();
  const [location] = useLocation();
  const platformName = snapshot ? PLATFORM_META[snapshot.meta.platform].name : "—";

  return (
    <header className="topbar">
      <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Menyu">
        <Menu size={17} />
      </button>
      <div className="crumb">
        <span>{platformName}</span>
        <Chevron className="sep" />
        <b>{PAGE_TITLES[location] ?? "Sahifa"}</b>
      </div>
      <div className="top-actions">
        <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
          <Search size={14} />
          <span className="st-label">Qidiruv va buyruqlar…</span>
          <span className="kbd">⌘K</span>
        </button>
        <button className={`icon-btn ${syncing ? "spin" : ""}`} onClick={() => void refresh()} title="Ma'lumotni yangilash">
          <RefreshCw size={15} />
        </button>
        <span className="pill desktop-only">
          <span className={`live-dot ${live ? "pulse" : "off"}`} style={{ width: 6, height: 6 }} />
          {snapshot?.meta.period.label || "davrsiz"}
        </span>
        <button className="icon-btn" onClick={toggleTheme} title={theme === "dark" ? "Yorug' tema" : "Tungi tema"}>
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <AlertsMenu />
        <div className="avatar">NM</div>
      </div>
    </header>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Command palette (⌘K)                                                */
/* ------------------------------------------------------------------ */

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, snapshot, openCampaign, openCreative, toggleTheme, theme, refresh } = useDashboardContext();
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
    const nav = NAV.map((n) => ({ group: "Sahifalar", label: n.label, icon: <n.icon size={13} />, meta: n.path, run: () => navigate(n.path) }));
    const actions = [
      { group: "Amallar", label: theme === "dark" ? "Yorug' temaga o'tish" : "Tungi temaga o'tish", icon: <Sun size={13} />, meta: "", run: toggleTheme },
      { group: "Amallar", label: "Ma'lumotni yangilash (sync)", icon: <RefreshCw size={13} />, meta: "", run: () => void refresh() },
    ];
    const campaigns = (snapshot?.campaigns ?? []).slice(0, 30).map((c) => ({
      group: "Kampaniyalar",
      label: c.originalName,
      icon: <Target size={13} />,
      meta: `$${Math.round(c.metrics.spend)} · ${c.metrics.leads} lead`,
      run: () => openCampaign(c.id),
    }));
    const creatives = (snapshot?.creatives ?? []).slice(0, 30).map((c) => ({
      group: "Kreativlar",
      label: c.originalName,
      icon: <Sparkles size={13} />,
      meta: `$${Math.round(c.metrics.spend)}`,
      run: () => openCreative(c.id),
    }));
    const all = [...nav, ...actions, ...campaigns, ...creatives];
    if (!query.trim()) return all.slice(0, 22);
    const q = query.toLowerCase();
    return all.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 22);
  }, [query, snapshot, theme, toggleTheme, refresh, openCampaign, openCreative]);

  if (!paletteOpen) return null;

  const flat = items;
  const runItem = (i: number) => {
    flat[i]?.run();
    setPaletteOpen(false);
  };

  return (
    <div className="cmdk-overlay" onClick={() => setPaletteOpen(false)}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, flat.length - 1)); }
        if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
        if (e.key === "Enter") { e.preventDefault(); runItem(sel); }
      }}>
        <div className="cmdk-input">
          <Command size={15} />
          <input ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setSel(0); }} placeholder="Kampaniya, kreativ yoki sahifa bo'yicha qidirish…" />
          <span className="kbd" style={{ fontFamily: "var(--mono)", fontSize: 10, border: "1px solid var(--line)", borderRadius: 6, padding: "2px 6px", color: "var(--text-3)" }}>ESC</span>
        </div>
        <div className="cmdk-list">
          {flat.length === 0 && <div className="cmdk-empty">Hech narsa topilmadi — boshqa so'z bilan urinib ko'ring.</div>}
          {flat.map((item, i) => (
            <div key={`${item.group}-${item.label}-${i}`}>
              {(i === 0 || flat[i - 1].group !== item.group) && <div className="cmdk-group">{item.group}</div>}
              <button className={`cmdk-item ${sel === i ? "sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => runItem(i)}>
                <span className="c-ico">{item.icon}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                {item.meta && <span className="c-meta">{item.meta}</span>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
