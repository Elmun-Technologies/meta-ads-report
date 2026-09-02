import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { buildAlerts, SEVERITY_META } from "@/lib/alerts";
import { useDashboardContext } from "@/contexts/DashboardContext";

export function AlertsMenu() {
  const { snapshot, openCampaign, openCreative } = useDashboardContext();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const alerts = useMemo(() => (snapshot ? buildAlerts(snapshot) : []), [snapshot]);
  const criticalCount = alerts.filter((a) => a.severity === "risk" || a.severity === "warn").length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} title={`Signallar (${alerts.length})`} style={criticalCount ? { color: "var(--warn)", borderColor: "var(--warn)" } : undefined}>
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
            <b>Signal markazi</b>
            <span className="chip muted">{alerts.length} ta</span>
          </div>
          <div className="ap-list">
            {alerts.length === 0 && <div className="ap-empty">Signal yo'q — hammasi tartibda ✓</div>}
            {alerts.map((a) => (
              <button
                key={a.id}
                className="ap-item"
                onClick={() => {
                  if (a.target?.kind === "campaign") openCampaign(a.target.id);
                  else if (a.target?.kind === "creative") openCreative(a.target.id);
                  setOpen(false);
                }}
              >
                <span className={`chip ${SEVERITY_META[a.severity].chip}`} style={{ flex: "none" }}>
                  {SEVERITY_META[a.severity].label}
                </span>
                <span style={{ minWidth: 0 }}>
                  <b>{a.title}</b>
                  <small>{a.body}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
