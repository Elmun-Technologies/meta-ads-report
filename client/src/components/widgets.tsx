import type { ReactNode } from "react";
import {
  ArrowRight,
  MessageSquare,
  Repeat2,
  Scale,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { compact, money, pct, whole } from "@/lib/format";
import { TONE_STYLE, type Insight } from "@/lib/insights";

/* ---------------- Panel ---------------- */

export function Panel({
  kicker,
  title,
  sub,
  action,
  children,
  className,
  style,
}: {
  kicker?: string;
  title?: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`panel ${className ?? ""}`} style={style}>
      {(title || kicker || action) && (
        <div className="panel-head">
          <div style={{ minWidth: 0 }}>
            {kicker && <span className="kicker">{kicker}</span>}
            {title && <h3>{title}</h3>}
            {sub && <p className="p-sub">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------------- KPI card ---------------- */

export function KpiCard({
  label,
  value,
  sub,
  foot,
  icon,
  note,
  tone = "var(--accent)",
}: {
  /** Asosiy nom: o'zbekcha (inglizcha qavsda) */
  label: ReactNode;
  value: string;
  sub: ReactNode;
  foot?: ReactNode;
  icon?: ReactNode;
  /** "Bu raqam nima degani" — bir gaplik oddiy izoh */
  note?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="kpi-card" style={{ ["--tone" as string]: tone }}>
      <div className="kpi-top">
        <span className="t">{label}</span>
        {icon}
      </div>
      <div className="kpi-val">{value}</div>
      <div className="kpi-sub">{sub}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
      {note && <div className="kpi-note">{note}</div>}
    </div>
  );
}

/* ---------------- Insight cards ---------------- */

const INSIGHT_ICONS = {
  trophy: TrendingUp,
  scale: Scale,
  waste: Trash2,
  fatigue: Repeat2,
  focus: Target,
  chat: MessageSquare,
  budget: Sparkles,
};

export function InsightCard({
  insight,
  onAction,
}: {
  insight: Insight;
  onAction?: (insight: Insight) => void;
}) {
  const Icon = INSIGHT_ICONS[insight.icon];
  const tone = TONE_STYLE[insight.tone];
  return (
    <div className="insight-card">
      <span
        className="insight-ico"
        style={{ background: tone.bg, color: tone.color }}
      >
        <Icon size={16} />
      </span>
      <div style={{ minWidth: 0 }}>
        <h4>
          {insight.title}
          <span
            className={`chip ${insight.tone === "info" ? "accent" : insight.tone}`}
          >
            {tone.label}
          </span>
        </h4>
        <p>{insight.body}</p>
        {insight.action && onAction && (
          <button
            onClick={() => onAction(insight)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 8,
              fontSize: 11.5,
              color: "var(--accent)",
              fontWeight: 600,
            }}
          >
            {insight.action.label} <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Funnel ---------------- */

export interface FunnelStage {
  key: string;
  label: string;
  note: string;
  value: number;
  tone?: string;
}

export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map(s => s.value), 1);
  return (
    <div>
      {stages.map((stage, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const rate = prev && prev > 0 ? (stage.value / prev) * 100 : null;
        const width = Math.max((stage.value / max) * 100, 7);
        return (
          <div className="funnel-row" key={stage.key}>
            <div className="f-label">
              {stage.label}
              <small>{stage.note}</small>
            </div>
            <div className="funnel-track">
              <div
                className="funnel-fill"
                style={{
                  width: `${width}%`,
                  ["--tone" as string]: stage.tone,
                  animationDelay: `${i * 70}ms`,
                }}
              >
                <span>{whole(stage.value)}</span>
              </div>
            </div>
            <div className="f-rate">
              {rate != null ? (
                <>
                  <b>{rate >= 10 ? pct(rate, 1) : pct(rate, 2)}</b>
                  konv.
                </>
              ) : (
                <b style={{ color: "var(--text-3)" }}>100%</b>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Ranked rows ---------------- */

export function RankRow({
  label,
  value,
  valueLabel,
  share,
  tone = "var(--accent)",
  sub,
}: {
  label: string;
  value: number;
  valueLabel: string;
  share: number; // 0..1
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="rank-row">
      <div style={{ minWidth: 0 }}>
        <div className="r-head">
          <span style={{ fontWeight: 600 }}>{label}</span>
          <b className="mono" style={{ color: "var(--text)" }}>
            {valueLabel}
          </b>
        </div>
        <div className="rank-track">
          <div
            className="rank-fill"
            style={{
              width: `${Math.max(share * 100, 1.5)}%`,
              ["--tone" as string]: tone,
            }}
          />
        </div>
        {sub && (
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 5 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <div className="empty-state">
      {icon}
      <span>{text}</span>
    </div>
  );
}

export function SpendShare({ share }: { share: number }) {
  return (
    <span className="share-bar" title={`Spend ulushi: ${pct(share * 100, 1)}`}>
      <i style={{ width: `${Math.max(share * 100, 2)}%` }} />
    </span>
  );
}

export const fmt = { money, whole, compact, pct };
