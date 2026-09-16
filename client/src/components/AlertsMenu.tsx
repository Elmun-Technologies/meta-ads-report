import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { buildAlerts, SEVERITY_META } from "@/lib/alerts";
import {
  desktopNotify,
  disableNotifications,
  enableNotifications,
  notificationsEnabled,
  notificationsSupported,
} from "@/lib/notify";
import { useDashboardContext } from "@/contexts/DashboardContext";

export function AlertsMenu() {
  const { snapshot, openCampaign, openCreative } = useDashboardContext();
  const [open, setOpen] = useState(false);
  const [deskOn, setDeskOn] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const alerts = useMemo(
    () => (snapshot ? buildAlerts(snapshot) : []),
    [snapshot]
  );
  const criticalCount = alerts.filter(
    a => a.severity === "risk" || a.severity === "warn"
  ).length;

  // Desktop bildirishnoma holatini har ochilganda yangilaymiz
  useEffect(() => {
    if (open) setDeskOn(notificationsEnabled());
  }, [open]);

  const toggleDesktop = async () => {
    if (deskOn) {
      disableNotifications();
      setDeskOn(false);
      return;
    }
    const ok = await enableNotifications();
    setDeskOn(ok);
    if (ok) desktopNotify("Bildirishnomalar yoqildi", "Kritik signallar va yangi murojaatlar desktop'ga keladi");
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        className="icon-btn"
        onClick={() => setOpen(o => !o)}
        title={`Diqqat talab qiladigan holatlar (${alerts.length})`}
        style={
          criticalCount
            ? { color: "var(--warn)", borderColor: "var(--warn)" }
            : undefined
        }
      >
        <Bell size={15} />
        {criticalCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 99,
              background: "var(--risk)",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              display: "grid",
              placeItems: "center",
              fontFamily: "var(--mono)",
            }}
          >
            {criticalCount}
          </span>
        )}
      </button>
      {open && (
        <div className="alerts-pop">
          <div className="ap-head">
            <b>Diqqat talab qiladiganlar</b>
            <span className="chip muted">{alerts.length} ta</span>
          </div>
          <div className="ap-list">
            {alerts.length === 0 && (
              <div className="ap-empty">
                Muammo topilmadi — hammasi me'yorida
              </div>
            )}
            {alerts.map(a => (
              <button
                key={a.id}
                className="ap-item"
                onClick={() => {
                  if (a.target?.kind === "campaign") openCampaign(a.target.id);
                  else if (a.target?.kind === "creative")
                    openCreative(a.target.id);
                  setOpen(false);
                }}
              >
                <span
                  className={`chip ${SEVERITY_META[a.severity].chip}`}
                  style={{ flex: "none" }}
                >
                  {SEVERITY_META[a.severity].label}
                </span>
                <span style={{ minWidth: 0 }}>
                  <b>{a.title}</b>
                  <small>{a.body}</small>
                </span>
              </button>
            ))}
          </div>
          {/* Desktop bildirishnomalari — foydalanuvchi o'zi yoqadi */}
          <div
            className="ap-foot"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 14px",
              borderTop: "1px solid var(--line)",
            }}
          >
            {deskOn ? (
              <Bell size={13} style={{ color: "var(--good)", flex: "none" }} />
            ) : (
              <BellOff size={13} style={{ color: "var(--text-3)", flex: "none" }} />
            )}
            <span style={{ fontSize: 11.5, color: "var(--text-2)", minWidth: 0 }}>
              Desktop bildirishnomalar
              <small style={{ display: "block", fontSize: 10, color: "var(--text-3)" }}>
                {notificationsSupported()
                  ? deskOn
                    ? "yoqilgan — kritik signal va murojaatlar keladi"
                    : "o'chirilgan — faqat ekranda ko'rinadi"
                  : "bu brauzerda qo'llab-quvvatlanmaydi"}
              </small>
            </span>
            <button
              className={`switch ${deskOn ? "on" : ""}`}
              role="switch"
              aria-checked={deskOn}
              disabled={!notificationsSupported()}
              onClick={() => void toggleDesktop()}
              title="Desktop bildirishnomalarni yoqish/o'chirish"
              style={{
                marginLeft: "auto",
                flex: "none",
                width: 34,
                height: 19,
                borderRadius: 99,
                border: "1px solid var(--line)",
                background: deskOn ? "var(--good)" : "var(--panel-2)",
                position: "relative",
                cursor: notificationsSupported() ? "pointer" : "not-allowed",
                transition: "background .15s",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: deskOn ? 16 : 2,
                  width: 13,
                  height: 13,
                  borderRadius: 99,
                  background: "#fff",
                  transition: "left .15s",
                  boxShadow: "0 1px 2px rgba(0,0,0,.3)",
                }}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
